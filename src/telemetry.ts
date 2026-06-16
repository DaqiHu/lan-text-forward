import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const DATA_DIR = process.env.DATA_DIR || resolveDefaultDataDir();
const NODE_ENV = process.env.NODE_ENV || "development";

function resolveDefaultDataDir(): string {
  if (DATA_DIR) return path.resolve(DATA_DIR);
  const isProd = NODE_ENV === "production";
  if (isProd) {
    const programData =
      process.env.ProgramData ||
      path.join(os.homedir(), "AppData", "Local");
    return path.join(programData, "lan-paste");
  }
  return path.join(process.cwd(), "data");
}

const dataDir = resolveDefaultDataDir();
fs.mkdirSync(dataDir, { recursive: true });
const eventsPath = path.join(dataDir, "telemetry.jsonl");

// ── Types ─────────────────────────────────────────────────────

export interface PasteEvent {
  timestamp: string;
  duration_ms: number;
  text_length: number;
  status: "ok" | "error";
  error?: string;
  target: "self" | "remote" | "unknown";
}

// ── Write ─────────────────────────────────────────────────────

const writeStream = fs.createWriteStream(eventsPath, { flags: "a" });

export function recordPaste(ev: Omit<PasteEvent, "timestamp">): void {
  const entry: PasteEvent = { timestamp: new Date().toISOString(), ...ev };
  writeStream.write(JSON.stringify(entry) + "\n");
}

// ── Read ──────────────────────────────────────────────────────

function readAll(): PasteEvent[] {
  if (!fs.existsSync(eventsPath)) return [];
  const raw = fs.readFileSync(eventsPath, "utf-8").trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => JSON.parse(line) as PasteEvent);
}

// ── Stats ─────────────────────────────────────────────────────

export interface PasteStats {
  total: number;
  ok: number;
  error: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  avg_text_len: number;
  last_24h: number;
}

export function getStats(): PasteStats {
  const all = readAll();
  if (all.length === 0) {
    return { total: 0, ok: 0, error: 0, avg_ms: 0, p50_ms: 0, p95_ms: 0, avg_text_len: 0, last_24h: 0 };
  }

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const okEvents = all.filter((e) => e.status === "ok");
  const durations = okEvents.map((e) => e.duration_ms).sort((a, b) => a - b);

  const total = all.length;
  const okCount = okEvents.length;
  const errorCount = total - okCount;
  const avgMs = okCount > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / okCount) : 0;
  const avgTextLen = total > 0 ? Math.round(all.reduce((a, e) => a + e.text_length, 0) / total) : 0;

  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const last24h = all.filter((e) => new Date(e.timestamp) >= dayAgo).length;

  return { total, ok: okCount, error: errorCount, avg_ms: avgMs, p50_ms: p50, p95_ms: p95, avg_text_len: avgTextLen, last_24h: last24h };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function getRecent(limit = 20): PasteEvent[] {
  const all = readAll();
  return all.slice(-limit).reverse();
}

export function closeTelemetry(): void {
  writeStream.end();
}
