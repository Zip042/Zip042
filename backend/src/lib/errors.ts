import type { ContentfulStatusCode } from "hono/utils/http-status";

/** 도메인/애플리케이션 오류. 라우트 밖으로 나가면 전역 핸들러가 JSON으로 직렬화한다. */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly detail?: unknown;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    detail?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const badRequest = (message: string, detail?: unknown) =>
  new AppError(400, "BAD_REQUEST", message, detail);

export const unauthorized = (message = "로그인이 필요합니다.") =>
  new AppError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "권한이 없습니다.") =>
  new AppError(403, "FORBIDDEN", message);

export const notFound = (message = "대상을 찾을 수 없습니다.") =>
  new AppError(404, "NOT_FOUND", message);

export const conflict = (message: string, detail?: unknown) =>
  new AppError(409, "CONFLICT", message, detail);

export const unprocessable = (message: string, detail?: unknown) =>
  new AppError(422, "UNPROCESSABLE", message, detail);

/** 외부 API(공공데이터포털 · Anthropic)가 실패했을 때. */
export const upstreamFailed = (message: string, detail?: unknown) =>
  new AppError(502, "UPSTREAM_FAILED", message, detail);

export const internal = (message = "서버 오류가 발생했습니다.", detail?: unknown) =>
  new AppError(500, "INTERNAL", message, detail);
