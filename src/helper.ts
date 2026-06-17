/**
 * 粘贴 Helper — 通过 HTTP 长轮询与 lan-paste 服务通信。
 *
 * 运行在用户桌面 Session，有剪贴板和按键权限。
 * 放到启动文件夹（scripts/register-helper.ps1）实现开机自启。
 */
import { doPasteAndRestore } from "./paste";

const SERVER = process.env.HELPER_SERVER || "http://localhost:18765";
const POLL_MS = 500;

async function poll(): Promise<void> {
  while (true) {
    try {
      const pullResp = await fetch(`${SERVER}/internal/pull`);
      const job = (await pullResp.json()) as {
        type: string;
        requestId?: string;
        text?: string;
      };

      if (job.type === "paste" && job.requestId && job.text) {
        console.log(`[helper] paste request (${job.text.length} chars)`);
        try {
          await doPasteAndRestore(job.text);
          await fetch(`${SERVER}/internal/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: job.requestId,
              success: true,
            }),
          });
          console.log("[helper] paste ok");
        } catch (err) {
          const message = (err as Error).message;
          console.error(`[helper] paste failed: ${message}`);
          await fetch(`${SERVER}/internal/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: job.requestId,
              success: false,
              error: message,
            }),
          });
        }
      }
    } catch (err) {
      console.error(`[helper] poll error: ${(err as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

console.log("[helper] starting (HTTP polling mode)...");
poll();
