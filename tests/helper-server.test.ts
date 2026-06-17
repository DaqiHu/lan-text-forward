/**
 * Helper HTTP 长轮询架构测试。
 * 运行：pnpm test:server
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";

const PORT = 18772;

function json(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: string) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

describe("Internal HTTP helper protocol", () => {
  let server: http.Server;
  let pendingJobs: Map<
    string,
    { text: string; timer: NodeJS.Timeout; resolve: (r: unknown) => void; dispatched: boolean }
  >;
  let url: string;

  before(async () => {
    pendingJobs = new Map();

    server = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");

      if (req.method === "GET" && req.url === "/internal/pull") {
        let found: [string, { text: string; timer: NodeJS.Timeout; resolve: (r: unknown) => void; dispatched: boolean }] | undefined;
        for (const entry of pendingJobs) {
          if (!entry[1].dispatched) {
            found = entry as typeof found;
            break;
          }
        }
        if (!found) {
          res.end(JSON.stringify({ type: "idle" }));
          return;
        }
        const [id, job] = found;
        job.dispatched = true;
        res.end(JSON.stringify({ type: "paste", requestId: id, text: job.text }));
      } else if (req.method === "POST" && req.url === "/internal/push") {
        const body = (await json(req)) as {
          requestId?: string;
          success?: boolean;
          error?: string;
        };
        if (!body.requestId) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "missing requestId" }));
          return;
        }
        const job = pendingJobs.get(body.requestId);
        if (job) {
          clearTimeout(job.timer);
          pendingJobs.delete(body.requestId);
          job.resolve({ success: !!body.success, error: body.error });
        }
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });

    await new Promise<void>((resolve) => server.listen(PORT, resolve));
    url = `http://localhost:${PORT}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET /internal/pull returns idle when no jobs", async () => {
    const resp = await fetch(`${url}/internal/pull`);
    const body = await resp.json();
    assert.strictEqual(body.type, "idle");
  });

  it("delivers job via pull then receives result via push", async () => {
    // Server creates a job
    const requestId = Math.random().toString(36).slice(2);
    const jobPromise = new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        const timer = setTimeout(
          () => resolve({ success: false, error: "timeout" }),
          5000,
        );
        pendingJobs.set(requestId, { text: "hello", timer, resolve, dispatched: false });
      },
    );

    // Helper pulls
    const pullResp = await fetch(`${url}/internal/pull`);
    const job = await pullResp.json();
    assert.strictEqual(job.type, "paste");
    assert.strictEqual(job.requestId, requestId);
    assert.strictEqual(job.text, "hello");

    // Helper executes mock paste and pushes result
    const pushResp = await fetch(`${url}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, success: true }),
    });
    assert.strictEqual(pushResp.status, 200);

    // Server job promise resolves
    const result = await jobPromise;
    assert.strictEqual(result.success, true);
  });

  it("job times out if helper never responds", async () => {
    const requestId = Math.random().toString(36).slice(2);
    const jobPromise = new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        const timer = setTimeout(
          () => resolve({ success: false, error: "timeout" }),
          200,
        );
        pendingJobs.set(requestId, { text: "x", timer, resolve, dispatched: false });
      },
    );

    // Don't pull — job should timeout
    const result = await jobPromise;
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "timeout");
  });

  it("push with unknown requestId returns ok", async () => {
    const resp = await fetch(`${url}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "nonexistent", success: true }),
    });
    assert.strictEqual(resp.status, 200);
    const body = await resp.json();
    assert.strictEqual(body.ok, true);
  });

  it("dispatched job is not returned by second pull", async () => {
    const requestId = "dedup-test";
    // Create a job manually (dispatched = false)
    const jobPromise = new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        const timer = setTimeout(
          () => resolve({ success: false, error: "timeout" }),
          5000,
        );
        pendingJobs.set(requestId, {
          text: "dedup",
          timer,
          resolve,
          dispatched: false,
        });
      },
    );

    // First pull gets the job
    const pull1 = await fetch(`${url}/internal/pull`);
    const job1 = await pull1.json();
    assert.strictEqual(job1.type, "paste");
    assert.strictEqual(job1.requestId, requestId);

    // Second pull should NOT get it (dispatched = true)
    const pull2 = await fetch(`${url}/internal/pull`);
    const job2 = await pull2.json();
    assert.strictEqual(job2.type, "idle");

    // Cleanup — push result to resolve the promise
    await fetch(`${url}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, success: true }),
    });
    await jobPromise;
  });

  it("push idempotency — second push for same job is silent no-op", async () => {
    const requestId = "idem-test";
    const jobPromise = new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        const timer = setTimeout(
          () => resolve({ success: false, error: "timeout" }),
          5000,
        );
        pendingJobs.set(requestId, {
          text: "idem",
          timer,
          resolve,
          dispatched: true, // simulate already dispatched
        });
      },
    );

    // First push resolves
    const r1 = await fetch(`${url}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, success: true }),
    });
    assert.strictEqual(r1.status, 200);

    // Second push is idempotent (job already deleted by first resolve)
    const r2 = await fetch(`${url}/internal/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, success: true }),
    });
    assert.strictEqual(r2.status, 200);
    const r2body = await r2.json();
    assert.strictEqual(r2body.ok, true);

    const result = await jobPromise;
    assert.strictEqual(result.success, true);
  });
});
