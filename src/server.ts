import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { execSync } from "child_process";
import { resolvePort, RATE_LIMIT_MS, MAX_TEXT_LENGTH } from "./config";
import { startDiscovery, DeviceInfo } from "./discovery";
import { doPasteAndRestore } from "./paste";

// ═══ 内部粘贴 Helper 支持 ═══
// Helper 连到 /internal，Server 把 paste-to-self 委托给它执行。
// 避免 NSSM 服务在 Session 0 无权操作剪贴板和模拟按键。

const internalWss = new WebSocketServer({ server, path: "/internal" });
const helpers = new Set<WebSocket>();

internalWss.on("connection", (ws: WebSocket) => {
  log.info("paste helper connected");
  helpers.add(ws);

  ws.on("close", () => {
    helpers.delete(ws);
    log.info("paste helper disconnected");
  });

  ws.on("error", (err) => {
    helpers.delete(ws);
    log.error({ err: err.message }, "paste helper error");
  });
});

/**
 * 通过内部 WS 向 Helper 发送粘贴指令，等待结果。
 * 返回 true/false 表示成功与否。
 */
function delegatePaste(text: string, timeoutMs = 10000): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (helpers.size === 0) {
      resolve({ success: false, error: "没有可用的粘贴 Helper（请确保已启动 helper 进程）" });
      return;
    }

    const requestId = Math.random().toString(36).slice(2);
    const payload = JSON.stringify({ type: "paste", text, requestId });

    let responded = false;
    const timer = setTimeout(() => {
      if (!responded) {
        responded = true;
        resolve({ success: false, error: "粘贴 Helper 响应超时" });
      }
    }, timeoutMs);

    const onMessage = (raw: Buffer) => {
      try {
        const reply = JSON.parse(raw.toString());
        if (reply.type === "paste-result" && reply.requestId === requestId) {
          responded = true;
          clearTimeout(timer);
          resolve({ success: reply.success === true, error: reply.error });
        }
      } catch { /* ignore */ }
    };

    // 选第一个可用 helper
    const helper = helpers.values().next().value as WebSocket;
    helper.once("message", onMessage);
    helper.send(payload);
  });
}
import { createLogger } from "./logger";
import { recordPaste, getStats, getRecent, closeTelemetry } from "./telemetry";

const log = createLogger("lan-paste");
const HTTP_PORT = resolvePort();

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, "..", "public")));
app.use(express.json());

const discovery = startDiscovery();

// ── HTTP API ──────────────────────────────────────────────────

app.get("/devices", (_req, res) => {
  res.json({
    selfId: discovery.getSelfId(),
    devices: discovery.getDevices(),
  });
});

app.post("/paste", async (req, res) => {
  const { text } = req.body;

  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "缺少有效的 text" });
    return;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    res.status(400).json({ error: `text 过长（最大 ${MAX_TEXT_LENGTH} 字节）` });
    return;
  }

  try {
    await doPasteAndRestore(text);
    res.json({ success: true });
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err: message }, "paste failed");
    res.status(500).json({ error: message });
  }
});

// ── GET /admin/stats ──────────────────────────────────────────

app.get("/admin/stats", (_req, res) => {
  res.json({ stats: getStats(), recent: getRecent(10) });
});

// ── WebSocket ─────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: "/ws" });

function forwardPaste(target: DeviceInfo, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text });
    const options: http.RequestOptions = {
      hostname: target.ip,
      port: target.port,
      path: "/paste",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
      timeout: 5000,
    };

    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk: string) => { body += chunk; });
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`目标返回 ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", (err) => {
      reject(new Error(`连接目标失败: ${err.message}`));
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("连接目标超时"));
    });

    req.write(data);
    req.end();
  });
}

wss.on("connection", (ws: WebSocket) => {
  log.info("WS client connected");

  let lastPasteTime = 0;

  ws.on("message", async (raw: Buffer) => {
    let msg: { targetId?: string; text?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "消息格式错误" }));
      return;
    }

    const { targetId, text } = msg;

    if (typeof text !== "string" || text.trim().length === 0) return;

    if (text.length > MAX_TEXT_LENGTH) {
      ws.send(JSON.stringify({ type: "error", message: `文本过长（最大 ${MAX_TEXT_LENGTH} 字符）` }));
      return;
    }

    const now = Date.now();
    if (now - lastPasteTime < RATE_LIMIT_MS) {
      ws.send(JSON.stringify({ type: "error", message: "操作太频繁，请稍候" }));
      return;
    }
    lastPasteTime = now;

    const devices = discovery.getDevices();
    const target = devices.find((d) => d.id === targetId);
    if (!target) {
      ws.send(JSON.stringify({ type: "error", message: "目标设备离线或不存在" }));
      return;
    }

    const selfId = discovery.getSelfId();
    const t0 = performance.now();

    if (target.id === selfId) {
      // 优先委托给桌面 Helper（有剪贴板权限）
      if (helpers.size > 0) {
        const result = await delegatePaste(text);
        const dur = Math.round(performance.now() - t0);
        if (result.success) {
          log.info({ textLen: text.length, duration_ms: dur }, "paste to self ok (via helper)");
          recordPaste({ duration_ms: dur, text_length: text.length, status: "ok", target: "self" });
          ws.send(JSON.stringify({ type: "success", message: "已粘贴到本机" }));
        } else {
          log.error({ err: result.error, textLen: text.length, duration_ms: dur }, "paste to self failed (helper)");
          recordPaste({ duration_ms: dur, text_length: text.length, status: "error", error: result.error!, target: "self" });
          ws.send(JSON.stringify({ type: "error", message: result.error }));
        }
      } else {
        // 无 Helper — 直接执行（仅在 dev 手动运行时有效，NSSM 下会报 Access Denied）
        try {
          await doPasteAndRestore(text);
          const dur = Math.round(performance.now() - t0);
          log.info({ textLen: text.length, duration_ms: dur }, "paste to self ok (direct)");
          recordPaste({ duration_ms: dur, text_length: text.length, status: "ok", target: "self" });
          ws.send(JSON.stringify({ type: "success", message: "已粘贴到本机" }));
        } catch (err) {
          const dur = Math.round(performance.now() - t0);
          const message = (err as Error).message;
          log.error({ err: message, textLen: text.length, duration_ms: dur }, "paste to self failed (direct)");
          recordPaste({ duration_ms: dur, text_length: text.length, status: "error", error: message, target: "self" });
          ws.send(JSON.stringify({ type: "error", message }));
        }
      }
    } else {
      try {
        await forwardPaste(target, text);
        const dur = Math.round(performance.now() - t0);
        log.info({ target: target.hostname, textLen: text.length, duration_ms: dur }, "paste to remote ok");
        recordPaste({ duration_ms: dur, text_length: text.length, status: "ok", target: "remote" });
        ws.send(JSON.stringify({ type: "success", message: `已粘贴到 ${target.hostname}` }));
      } catch (err) {
        const dur = Math.round(performance.now() - t0);
        const message = (err as Error).message;
        log.error({ err: message, target: target.hostname, duration_ms: dur }, "paste to remote failed");
        recordPaste({ duration_ms: dur, text_length: text.length, status: "error", error: message, target: "remote" });
        ws.send(JSON.stringify({ type: "error", message }));
      }
    }
  });

  ws.on("close", () => {
    log.info("WS client disconnected");
  });

  ws.on("error", (err) => {
    log.error({ err: err.message }, "WS connection error");
  });
});

// ── Firewall ──────────────────────────────────────────────────

function trySetupFirewall(): void {
  try {
    execSync(
      `netsh advfirewall firewall add rule name="lan-paste (TCP ${HTTP_PORT})" `
      + `dir=in protocol=tcp localport=${HTTP_PORT} action=allow `
      + `profile=domain,private description="Allow LAN paste service"`,
      { stdio: "pipe", timeout: 5000 },
    );
    log.info("firewall rule added");
  } catch {
    log.warn({ port: HTTP_PORT }, "firewall rule could not be added (run as admin to auto-configure)");
  }
}

// ── Startup ───────────────────────────────────────────────────

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    log.error({ port: HTTP_PORT }, "port already in use");
    process.exit(1);
  }
  log.error({ err: err.message }, "server startup failed");
  process.exit(1);
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
  log.info({ port: HTTP_PORT }, "lan-paste server started");
  console.log("═══════════════════════════════════════════");
  console.log("  局域网快传粘贴服务已启动");
  console.log(`  端口: ${HTTP_PORT}`);
  console.log("═══════════════════════════════════════════");
  trySetupFirewall();
});

// ── Cleanup ───────────────────────────────────────────────────

process.on("SIGINT", () => { closeTelemetry(); process.exit(0); });
process.on("SIGTERM", () => { closeTelemetry(); process.exit(0); });
