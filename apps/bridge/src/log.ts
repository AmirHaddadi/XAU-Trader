import { config } from "./config.js";

const levels = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof levels;

function write(level: Level, scope: string, message: string, extra?: unknown) {
  if (levels[level] < levels[config.logLevel]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${scope}: ${message}`;
  if (extra !== undefined) console.log(line, extra);
  else console.log(line);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, extra?: unknown) => write("debug", scope, message, extra),
    info: (message: string, extra?: unknown) => write("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => write("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => write("error", scope, message, extra),
  };
}
