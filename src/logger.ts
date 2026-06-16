import pino from "pino";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const LOG_DIR = process.env.LOGS_DIR || resolveDefaultLogDir();
const NODE_ENV = process.env.NODE_ENV || "development";

function resolveDefaultLogDir(): string {
  const isProd = NODE_ENV === "production";
  if (isProd) {
    const programData =
      process.env.ProgramData ||
      path.join(os.homedir(), "AppData", "Local");
    return path.join(programData, "lan-paste", "logs");
  }
  return path.join(process.cwd(), "logs");
}

/**
 * pino logger factory.
 *
 * Dual output: pretty stdout + file rotation (daily, 14d info / 30d error).
 * Prod logs go to %ProgramData%/lan-paste/logs, dev logs go to ./logs.
 */
export function createLogger(name: string): pino.Logger {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const isDev = NODE_ENV !== "production";
  const level = isDev ? "debug" : "info";

  return pino(
    { name, level },
    pino.transport({
      targets: [
        {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
          level,
        },
        {
          target: "pino-roll",
          options: {
            file: path.join(LOG_DIR, name),
            frequency: "daily",
            limit: { count: 14 },
            extension: ".log",
          },
          level: "info",
        },
        {
          target: "pino-roll",
          options: {
            file: path.join(LOG_DIR, `${name}-error`),
            frequency: "daily",
            limit: { count: 30 },
            extension: ".log",
          },
          level: "error",
        },
      ],
    }),
  );
}

export type { Logger } from "pino";
