/**
 * Helper & internal WebSocket 架构测试。
 *
 * 使用 Node 内置 test runner（node --experimental-test-modules 或 tsx）。
 * 启动方式：npx tsx tests/helper-server.test.ts
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = 18770; // 测试用非标准端口

// ═══════════════════════════════════════════════════════════════
// 模拟 Server 端：接收 helper 连接，发送粘贴指令，等结果
// ═══════════════════════════════════════════════════════════════

describe("Internal WebSocket (helper ↔ server)", () => {
  let server: http.Server;
  let wss: WebSocketServer;
  let helperSet: Set<WebSocket>;
  let serverUrl: string;

  before(async () => {
    server = http.createServer();
    wss = new WebSocketServer({ server, path: "/internal" });
    helperSet = new Set();

    wss.on("connection", (ws) => {
      helperSet.add(ws);
      ws.on("close", () => helperSet.delete(ws));
    });

    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    serverUrl = `ws://localhost:${PORT}/internal`;
  });

  after(async () => {
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("accepts helper connection", async () => {
    const ws = new WebSocket(serverUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        assert.ok(helperSet.has(ws));
        ws.close();
        resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 2000);
    });
  });

  it("removes helper on disconnect", async () => {
    const ws = new WebSocket(serverUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.close();
      });
      ws.on("close", () => {
        // Wait a tick for the server's close handler
        setTimeout(() => {
          assert.ok(!helperSet.has(ws));
          resolve();
        }, 50);
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("delegates paste to helper and receives result", async () => {
    // 这个测试模拟完整的 delegate → helper → result 流程
    const ws = new WebSocket(serverUrl);
    const requestId = Math.random().toString(36).slice(2);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        // Server sends paste command
        ws.send(
          JSON.stringify({
            type: "paste",
            text: "test text",
            requestId,
          }),
        );
      });

      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        // Helper would normally execute paste here — we mock success
        if (msg.type === "paste" && msg.requestId === requestId) {
          ws.send(
            JSON.stringify({
              type: "paste-result",
              requestId: msg.requestId,
              success: true,
            }),
          );
        }
        if (
          msg.type === "paste-result" &&
          msg.requestId === requestId
        ) {
          assert.strictEqual(msg.success, true);
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("helper reports error on paste failure", async () => {
    const ws = new WebSocket(serverUrl);
    const requestId = Math.random().toString(36).slice(2);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.send(
          JSON.stringify({ type: "paste", text: "bad text", requestId }),
        );
      });

      ws.on("message", (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "paste" && msg.requestId === requestId) {
          ws.send(
            JSON.stringify({
              type: "paste-result",
              requestId: msg.requestId,
              success: false,
              error: "Access is denied",
            }),
          );
        }
        if (msg.type === "paste-result" && msg.requestId === requestId) {
          assert.strictEqual(msg.success, false);
          assert.strictEqual(msg.error, "Access is denied");
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });

  it("can have multiple helpers connected", async () => {
    const ws1 = new WebSocket(serverUrl);
    const ws2 = new WebSocket(serverUrl);

    await new Promise<void>((resolve, reject) => {
      let openCount = 0;
      const onOpen = () => {
        openCount++;
        if (openCount === 2) {
          assert.strictEqual(helperSet.size, 2);
          ws1.close();
          ws2.close();
          resolve();
        }
      };
      ws1.on("open", onOpen);
      ws2.on("open", onOpen);
      ws1.on("error", reject);
      ws2.on("error", reject);
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
  });
});
