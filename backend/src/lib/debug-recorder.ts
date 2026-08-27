/**
 * 개발용 요청·이벤트 기록기 (관리자 콘솔의 데이터 원천).
 *
 * ## 왜 필요한가
 *
 * 이 서비스는 판정이 왜 그렇게 나왔는지 설명할 수 있어야 합니다. 그런데 화면만 보면
 * "어떤 외부 API 가 실제로 호출됐는지", "AI 가 무엇을 읽었는지", "무엇이 실패해서
 * 판단 불가가 됐는지"가 보이지 않습니다. 터미널 로그는 JSON 한 줄씩이라 시연 중에
 * 읽기 어렵습니다.
 *
 * 그래서 최근 기록을 메모리에 링버퍼로 두고 한 화면에서 봅니다.
 *
 * ## 안전장치
 *
 * 여기에는 **실제 사용자 데이터가 남습니다**(등기부에서 읽은 주소·이름 등).
 * 그래서 기본은 꺼져 있고, `ZIP042_DEBUG_CONSOLE=true` 로 명시해야 켜집니다.
 * 운영(`NODE_ENV=production`)에서는 env 검증 단계에서 아예 부팅을 막습니다.
 *
 * 디스크에 쓰지 않고 메모리에만 둡니다 — 서버를 끄면 사라집니다.
 */

/** 최근 몇 건까지 들고 있을지. 메모리에만 두므로 넉넉해도 부담이 적습니다. */
const CAPACITY = 300;

export type DebugKind = "request" | "log";

export interface DebugEntry {
  seq: number;
  ts: string;
  kind: DebugKind;
  /** log 이벤트의 level. request 는 항상 "info". */
  level: "debug" | "info" | "warn" | "error";
  message: string;
  /** 요청일 때만 채워집니다. */
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  /** 나머지 구조화 필드. */
  fields?: Record<string, unknown>;
}

let enabled = false;
let seq = 0;
const buffer: DebugEntry[] = [];

export function enableDebugRecorder(): void {
  enabled = true;
}

export function isDebugRecorderEnabled(): boolean {
  return enabled;
}

/**
 * 값이 너무 크면 화면이 멈춥니다. base64 문서 같은 것이 섞이면 수 MB 가 되므로
 * 길이를 자릅니다 — **자를 때는 잘렸다고 표시합니다**(조용히 줄이면 없는 값으로 오해합니다).
 */
function shrink(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 400 ? `${value.slice(0, 400)}… (${value.length}자 중 앞부분)` : value;
  }
  if (typeof value !== "object") return value;
  if (depth >= 3) return "…";

  if (Array.isArray(value)) {
    const head = value.slice(0, 20).map((v) => shrink(v, depth + 1));
    return value.length > 20 ? [...head, `… 외 ${value.length - 20}건`] : head;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shrink(v, depth + 1);
  }
  return out;
}

function push(entry: Omit<DebugEntry, "seq" | "ts">): void {
  if (!enabled) return;
  buffer.push({ seq: ++seq, ts: new Date().toISOString(), ...entry });
  if (buffer.length > CAPACITY) buffer.splice(0, buffer.length - CAPACITY);
}

export function recordRequest(info: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId?: string;
}): void {
  // 콘솔은 자기 자신을 0.7초마다 부른다. 그것까지 남기면 정작 볼 요청이 묻힌다.
  if (info.path.startsWith("/v1/_debug") || info.path === "/favicon.ico") return;
  push({ kind: "request", level: info.status >= 500 ? "error" : info.status >= 400 ? "warn" : "info", message: `${info.method} ${info.path}`, ...info });
}

export function recordLog(
  level: DebugEntry["level"],
  message: string,
  fields?: Record<string, unknown>,
): void {
  // 접근 로그는 recordRequest 가 이미 더 자세히 남깁니다. 중복을 피합니다.
  if (message === "request") return;
  push({
    kind: "log",
    level,
    message,
    ...(fields ? { fields: shrink(fields) as Record<string, unknown> } : {}),
  });
}

/** `afterSeq` 이후에 쌓인 것만 돌려줍니다 (화면이 폴링할 때 중복을 피하려고). */
export function readEntries(afterSeq = 0): DebugEntry[] {
  return buffer.filter((e) => e.seq > afterSeq);
}

export function clearEntries(): void {
  buffer.length = 0;
}
