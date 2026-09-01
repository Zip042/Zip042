import { analyzeNow, getAnalysisJob, getMeta, startAnalysisJob } from "./api";

/**
 * 분석을 실행하고 끝날 때까지 기다린다.
 *
 * ## 왜 경로가 두 개인가
 *
 * 백엔드는 분석을 두 방식으로 제공한다.
 *
 *  - **비동기** (`POST .../analyze/jobs` → 폴링) — 문서 판독은 20~60초가 걸린다.
 *    모바일 네트워크가 끊겨도 다시 붙어 결과를 받을 수 있어 기본으로 쓴다.
 *  - **동기** (`POST .../analyze`) — 한 번의 요청으로 끝까지 계산한다.
 *
 * 그런데 **서버리스(Vercel)에서는 응답을 보낸 뒤 백그라운드 실행이 보장되지 않는다.**
 * 작업만 등록되고 아무도 실행하지 않아 진행률이 영원히 0에서 멈춘다.
 * 백엔드가 `GET /v1/meta` 의 `capabilities.asyncAnalysis` 로 이 사실을 알려주므로,
 * 화면은 그 값을 보고 경로를 고른다. 배포 환경을 화면이 추측하지 않는다.
 *
 * meta 는 한 번만 받아 캐시한다 — 분석할 때마다 물어볼 값이 아니다.
 */

let asyncSupported: boolean | null = null;

async function canUseAsync(): Promise<boolean> {
  if (asyncSupported !== null) return asyncSupported;
  try {
    const meta = (await getMeta()) as unknown as {
      capabilities?: { asyncAnalysis?: boolean };
    };
    asyncSupported = meta.capabilities?.asyncAnalysis ?? false;
  } catch {
    // meta 를 못 받으면 동기 경로가 안전하다. 비동기는 실패해도 그 사실을 알 수 없다.
    asyncSupported = false;
  }
  return asyncSupported;
}

export interface AnalysisProgress {
  progress: number;
  step: string | null;
}

export interface RunAnalysisOptions {
  reparseDocuments?: boolean;
  refreshMarketPrice?: boolean;
  /** 진행 상황을 화면에 전달한다. 동기 경로에서는 시작·완료 두 번만 호출된다. */
  onProgress?: (p: AnalysisProgress) => void;
}

/** 폴링 상한. 1초 간격 × 120 = 2분. 실제 판독이 이보다 오래 걸리면 사용자에게 알린다. */
const MAX_POLLS = 120;

/**
 * 분석 결과를 돌려준다.
 *
 * 동기 경로는 계산 결과를 응답에 담아 주므로 그대로 반환한다. 비동기 경로는 작업 완료만
 * 알려주므로 `null` 이고, 화면이 `GET .../analysis` 로 따로 받는다.
 *
 * 이 값을 화면이 보관해 두면, 서버가 그 검사 건을 잃어버려도(데모 배포의 서버리스
 * 인스턴스 분리) 방금 받은 판정을 계속 보여줄 수 있다.
 */
export async function runAnalysis(
  caseId: string,
  { reparseDocuments, refreshMarketPrice, onProgress }: RunAnalysisOptions = {},
): Promise<Record<string, unknown> | null> {
  const body: Record<string, unknown> = {};
  if (reparseDocuments !== undefined) body.reparseDocuments = reparseDocuments;
  if (refreshMarketPrice !== undefined) body.refreshMarketPrice = refreshMarketPrice;

  if (!(await canUseAsync())) {
    // 동기 경로. 진행률을 알 수 없으므로 "계산 중"만 알린다.
    onProgress?.({ progress: 50, step: "위험을 판정하고 있어요" });
    const res = (await analyzeNow(caseId, body)) as unknown as {
      analysis?: Record<string, unknown>;
    } | null;
    onProgress?.({ progress: 100, step: "완료" });
    return res?.analysis ?? null;
  }

  const job = (await startAnalysisJob(caseId, body)) as unknown as {
    job: { id: string; status: string };
  };
  const jobId = job.job.id;

  for (let i = 0; i < MAX_POLLS; i += 1) {
    const res = (await getAnalysisJob(caseId, jobId)) as unknown as {
      job: { status: string; progress: number; step: string | null; errorMessage: string | null };
    };
    const j = res.job;
    onProgress?.({ progress: j.progress, step: j.step });

    if (j.status === "succeeded") {
      onProgress?.({ progress: 100, step: "완료" });
      return null;
    }
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(j.errorMessage ?? "분석이 중단되었습니다. 다시 시도해 주세요.");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error("분석이 예상보다 오래 걸립니다. 잠시 후 결과 화면에서 확인해 주세요.");
}
