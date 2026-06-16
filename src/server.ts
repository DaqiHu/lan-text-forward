import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { execSync } from "child_process";
import { resolvePort, RATE_LIMIT_MS, MAX_TEXT_LENGTH } from "./config";
import { startDiscovery, DeviceInfo } from "./discovery";
import { doPasteAndRestore } from "./paste";
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
      try {
        await doPasteAndRestore(text);
        const dur = Math.round(performance.now() - t0);
        log.info({ textLen: text.length, duration_ms: dur }, "paste to self ok");
        recordPaste({ duration_ms: dur, text_length: text.length, status: "ok", target: "self" });
        ws.send(JSON.stringify({ type: "success", message: "已粘贴到本机" }));
      } catch (err) {
        const dur = Math.round(performance.now() - t0);
        const message = (err as Error).message;
        log.error({ err: message, textLen: text.length, duration_ms: dur }, "paste to self failed");
        recordPaste({ duration_ms: dur, text_length: text.length, status: "error", error: message, target: "self" });
        ws.send(JSON.stringify({ type: "error", message }));
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
