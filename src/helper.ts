/**
 * 粘贴 Helper — 运行在你的桌面 Session 中（非 NSSM 服务）。
 *
 * 连接到 lan-paste 服务的内部 WebSocket（localhost:18765/internal），
 * 等待粘贴指令，在桌面 Session 中执行剪贴板写入 + 模拟按键。
 *
 * 启动方式：放入 Windows 启动文件夹（shell:startup），用户登录后自动跑。
 * 或手动：tsx src/helper.ts   /   node dist/helper.js
 */
import WebSocket from "ws";
import { doPasteAndRestore } from "./paste";

const SERVER_URL = process.env.HELPER_SERVER || "ws://localhost:18765/internal";
const RECONNECT_MS = 3000;

let ws: WebSocket | null = null;

function connect(): void {
  ws = new WebSocket(SERVER_URL, { perMessageDeflate: false });

  ws.on("open", () => {
    console.log("[helper] connected to lan-paste server");
  });

  ws.on("message", async (raw: Buffer) => {
    let msg: { type?: string; text?: string; requestId?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type !== "paste" || !msg.text) return;

    const requestId = msg.requestId || "";
    console.log(`[helper] paste request (${msg.text.length} chars)`);

    try {
      await doPasteAndRestore(msg.text);
      ws?.send(JSON.stringify({ type: "paste-result", requestId, success: true }));
      console.log("[helper] paste ok");
    } catch (err) {
      const message = (err as Error).message;
      ws?.send(JSON.stringify({ type: "paste-result", requestId, success: false, error: message }));
      console.error(`[helper] paste failed: ${message}`);
    }
  });

  ws.on("close", () => {
    console.log("[helper] disconnected, reconnecting in 3s...");
    setTimeout(connect, RECONNECT_MS);
  });

  ws.on("error", (err) => {
    console.error(`[helper] connection error: ${err.message}`);
    ws?.close();
  });
}

connect();

// Keep alive
process.stdin.resume();
