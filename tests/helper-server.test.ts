/**
 * Helper & internal WebSocket 架构测试。
 * 运行：pnpm test:server
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = 18771;

describe("Internal WebSocket (helper ↔ server)", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let helpers: Set<WebSocket>;
  let url: string;

  before(async () => {
    server = http.createServer();
    wss = new WebSocketServer({ server, path: "/internal" });
    helpers = new Set();

    // Server 端行为：跟踪连接，收到 paste 消息后执行 mock 粘贴并回复
    wss.on("connection", (ws) => {
      helpers.add(ws);

      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "paste" && msg.requestId) {
          // mock: 文本长度 < 5 视为失败，否则成功
          const success = (msg.text as string).length >= 5;
          ws.send(
            JSON.stringify({
              type: "paste-result",
              requestId: msg.requestId,
              success,
              error: success ? undefined : "mock: text too short",
            }),
          );
        }
      });

      ws.on("close", () => helpers.delete(ws));
    });

    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    url = `ws://localhost:${PORT}/internal`;
  });

  after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("accepts helper connection", async () => {
    assert.strictEqual(helpers.size, 0);
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        // 给一个 tick 让 server 的 connection handler 跑完
        setImmediate(() => {
          assert.strictEqual(helpers.size, 1);
          ws.close();
          resolve();
        });
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 2000);
    });
  });

  it("removes helper on disconnect", async () => {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        assert.strictEqual(helpers.size, 1);
        ws.close();
      });
      ws.on("close", () => {
        setTimeout(() => {
          assert.strictEqual(helpers.size, 0);
          resolve();
        }, 50);
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("delegates paste and receives success", async () => {
    const ws = new WebSocket(url);
    const requestId = "test-req-1";

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "paste", text: "hello world", requestId }));
      });

      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "paste-result" && msg.requestId === requestId) {
          assert.strictEqual(msg.success, true);
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("delegates paste and receives error", async () => {
    const ws = new WebSocket(url);
    const requestId = "test-req-2";

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "paste", text: "abc", requestId })); // < 5 chars -> fail
      });

      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "paste-result" && msg.requestId === requestId) {
          assert.strictEqual(msg.success, false);
          assert.strictEqual(msg.error, "mock: text too short");
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("supports multiple helpers", async () => {
    assert.strictEqual(helpers.size, 0);
    const ws1 = new WebSocket(url);
    const ws2 = new WebSocket(url);

    await new Promise<void>((resolve, reject) => {
      let openCount = 0;
      const check = () => {
        openCount++;
        if (openCount === 2) {
          setImmediate(() => {
            assert.strictEqual(helpers.size, 2);
            ws1.close();
            ws2.close();
            resolve();
          });
        }
      };
      ws1.on("open", check);
      ws2.on("open", check);
      ws1.on("error", reject);
      ws2.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });
});
