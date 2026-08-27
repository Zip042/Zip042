import { recordLog } from "./debug-recorder.js";

type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold = ORDER.info;

export function setLogLevel(level: Level): void {
  threshold = ORDER[level];
}

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  };
  const sink = level === "error" || level === "warn" ? console.error : console.log;
  sink(JSON.stringify(line));

  // 관리자 콘솔에도 같은 내용을 남긴다. 꺼져 있으면 아무 일도 하지 않는다.
  recordLog(level, message, fields);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
};
