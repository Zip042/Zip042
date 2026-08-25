import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";
import {
  getAnalysis,
  getAnalysisJob,
  getCase,
  previewSchedule,
  startAnalysisJob,
  updateCase,
} from "@/lib/api";
import { toMessage, useAsync } from "@/lib/useAsync";
import { useAnalysisFlow } from "@/state/AnalysisFlow";

/**
 * 계약 조건 · 일정 입력.
 *
 * 금액은 화면에서 **만원 단위**로 다루고 `amountUnit: "man"` 으로 보냅니다.
 * 서버가 원 단위 정수로 정규화합니다 — 두 단위를 섞으면 100배 오차가 납니다.
 *
 * 일정 경고("잔금일과 전입신고일 사이 N일은 대항력이 없습니다")는 서버가 계산합니다.
 * "전입신고 다음 날 0시" 같은 한국 시간대 경계 규칙이 들어 있어 화면에서 흉내내면 어긋납니다.
 */

const LEASE_TYPES = [
  { value: "monthly", label: "월세" },
  { value: "jeonse", label: "전세" },
  { value: "semi_jeonse", label: "반전세" },
] as const;

type LeaseType = (typeof LEASE_TYPES)[number]["value"];

/** 검사 건 응답의 중첩 구조. 서버가 property / terms / schedule 로 나눠 내려준다. */
interface CaseDto {
  id: string;
  title?: string | null;
  property?: { roadAddress?: string | null; detailAddress?: string | null };
  terms?: { leaseType?: LeaseType; depositKrw?: number; monthlyRentKrw?: number };
  schedule?: {
    contractDate?: string | null;
    balanceDate?: string | null;
    residentRegistrationDate?: string | null;
  };
}

/** 원 단위를 화면용 만원 문자열로. */
function toMan(krw: number | null | undefined): string {
  if (!krw) return "";
  return String(Math.round(krw / 10_000));
}

export default function AnalyzeDetails() {
  const navigate = useNavigate();
  const flow = useAnalysisFlow();
  const caseId = flow.caseId;

  const caseData = useAsync(
    () => (caseId ? getCase(caseId) : Promise.resolve(null)),
    [caseId],
  );
  const analysis = useAsync(
    () => (caseId ? getAnalysis(caseId).catch(() => null) : Promise.resolve(null)),
    [caseId],
  );

  const [leaseType, setLeaseType] = useState<LeaseType>("monthly");
  const [deposit, setDeposit] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [balanceDate, setBalanceDate] = useState("");
  const [moveInDate, setMoveInDate] = useState("");

  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 서버에 이미 저장된 값이 있으면 폼을 채운다.
  // ⚠️ case 응답은 property / terms / schedule 로 **중첩**되어 있다. 평탄하게 읽으면 전부 undefined 다.
  useEffect(() => {
    const c = (caseData.data as unknown as { case?: CaseDto } | null)?.case;
    if (!c) return;
    setLeaseType(c.terms?.leaseType ?? "monthly");
    setDeposit(toMan(c.terms?.depositKrw));
    setMonthlyRent(toMan(c.terms?.monthlyRentKrw));
    setContractDate(c.schedule?.contractDate ?? "");
    setBalanceDate(c.schedule?.balanceDate ?? "");
    setMoveInDate(c.schedule?.residentRegistrationDate ?? "");
  }, [caseData.data]);

  /**
   * 날짜가 바뀔 때마다 서버에 물어 위험을 미리 보여준다.
   * 검사 건을 저장하지 않고 계산만 하므로 부담이 적다.
   */
  useEffect(() => {
    if (!balanceDate || !moveInDate) {
      setScheduleWarning(null);
      return;
    }
    let alive = true;
    previewSchedule({
      contractDate: contractDate || null,
      balanceDate,
      residentRegistrationDate: moveInDate,
    })
      .then((res) => {
        if (!alive) return;
        const s = (res as unknown as { schedule?: { unprotectedWindow?: { days: number } | null } }).schedule;
        const days = s?.unprotectedWindow?.days ?? 0;
        setScheduleWarning(
          days > 0
            ? `잔금일과 전입신고일 사이 ${days}일은 대항력이 없는 상태입니다. 같은 날로 맞추는 것을 권합니다.`
            : null,
        );
      })
      .catch(() => {
        if (alive) setScheduleWarning(null);
      });
    return () => {
      alive = false;
    };
  }, [contractDate, balanceDate, moveInDate]);

  async function saveAndAnalyze() {
    if (!caseId) return;
    setError(null);

    if (!deposit) {
      setError("보증금을 입력해 주세요.");
      return;
    }

    setSaving(true);
    try {
      await updateCase(caseId, {
        amountUnit: "man",
        leaseType,
        deposit: Number(deposit) || 0,
        monthlyRent: leaseType === "jeonse" ? 0 : Number(monthlyRent) || 0,
        contractDate: contractDate || null,
        balanceDate: balanceDate || null,
        residentRegistrationDate: moveInDate || null,
      });

      const job = await startAnalysisJob(caseId);
      const jobId = (job as unknown as { job: { id: string } }).job.id;
      for (let i = 0; i < 120; i += 1) {
        const res = (await getAnalysisJob(caseId, jobId)) as unknown as {
          job: { status: string; errorMessage: string | null };
        };
        if (res.job.status === "succeeded") break;
        if (res.job.status === "failed" || res.job.status === "canceled") {
          throw new Error(res.job.errorMessage ?? "분석이 중단되었습니다.");
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      navigate("/analyze/result");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!caseId) {
    return (
      <div className="border-b border-border bg-background-alt">
        <div className="mx-auto max-w-6xl px-8 py-11">
          <Stepper current={2} skipped={[1]} />
          <h1 className="mt-7 font-display text-2xl font-black tracking-tight">
            먼저 등기부등본을 올려주세요
          </h1>
          <Button
            className="mt-5 rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover"
            onClick={() => navigate("/analyze")}
          >
            등기부등본 올리러 가기
          </Button>
        </div>
      </div>
    );
  }

  const registry = (analysis.data as unknown as { analysis?: Record<string, unknown> } | null)?.analysis;
  const valuation = registry?.valuation as
    | { marketPrice?: { estimatedKrw: number; source: string }; seniorClaimsKrw?: number | null }
    | undefined;
  const caseRow = (caseData.data as unknown as { case?: CaseDto } | null)?.case;

  return (
    <div className="border-b border-border bg-background-alt">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={2} skipped={flow.skippedDocuments ? [1] : []} />

        <h1 className="mt-7 font-display text-2xl font-black tracking-tight">계약 조건과 일정을 알려주세요</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          아래 내용을 입력하면 전세가율과 일정 위험을 함께 판정할 수 있습니다.
        </p>

        <div className="mt-6 grid grid-cols-1 items-start gap-7 md:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-border bg-white p-7">
            <p className="text-xs font-bold tracking-wide text-muted-foreground-light">보증금 · 월세</p>
            <div className="mt-3 flex gap-2">
              {LEASE_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setLeaseType(t.value)}
                  className={
                    t.value === leaseType
                      ? "rounded-full bg-brand-primary px-4 py-2 text-sm font-bold text-white"
                      : "rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-border-strong"
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="mt-4.5 grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1.5 text-sm font-bold">
                  보증금 <span className="text-danger">*</span>
                </p>
                <div className="flex items-center justify-between rounded-[11px] border-[1.5px] border-brand-primary px-3.5 py-3">
                  <input
                    inputMode="numeric"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="10000"
                    className="w-full bg-transparent font-bold outline-none placeholder:font-normal placeholder:text-placeholder"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground-light">만원</span>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-bold">월세</p>
                <div
                  className={
                    leaseType === "jeonse"
                      ? "flex items-center justify-between rounded-[11px] border border-border bg-background-alt px-3.5 py-3 text-placeholder"
                      : "flex items-center justify-between rounded-[11px] border border-border px-3.5 py-3"
                  }
                >
                  <input
                    inputMode="numeric"
                    disabled={leaseType === "jeonse"}
                    value={leaseType === "jeonse" ? "" : monthlyRent}
                    onChange={(e) => setMonthlyRent(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="0"
                    className="w-full bg-transparent outline-none placeholder:text-placeholder disabled:cursor-not-allowed"
                  />
                  <span className="shrink-0 text-sm text-muted-foreground-light">만원</span>
                </div>
              </div>
            </div>

            <p className="mt-7.5 border-t border-border pt-6 text-xs font-bold tracking-wide text-muted-foreground-light">
              일정
            </p>
            <div className="mt-3.5 flex flex-col gap-3">
              <DateRow label="계약 예정일" required value={contractDate} onChange={setContractDate} />
              <DateRow label="잔금 예정일" required value={balanceDate} onChange={setBalanceDate} />
              <DateRow label="전입신고 예정일" value={moveInDate} onChange={setMoveInDate} />
            </div>

            {scheduleWarning && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger-border bg-white px-4.5 py-4">
                <Badge className="bg-danger">주의</Badge>
                <p className="text-sm leading-relaxed text-danger-text">{scheduleWarning}</p>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-danger-border bg-white px-4.5 py-4">
                <p className="text-sm text-danger-text">{error}</p>
              </div>
            )}

            <div className="mt-6.5 flex flex-wrap items-center gap-3.5 border-t border-border pt-5.5">
              <Button
                disabled={saving}
                onClick={() => void saveAndAnalyze()}
                className="rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover"
              >
                {saving ? "분석하는 중…" : "입력하고 결과 보기"}
              </Button>
              <Button
                variant="outline"
                className="rounded-xl border-border-strong"
                onClick={() => navigate("/analyze/documents")}
              >
                서류 다시 올리기
              </Button>
              <p className="text-sm text-muted-foreground-light">보증금만 넣어도 진행할 수 있습니다.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">등기부에서 읽은 값</p>
              <div className="mt-3.5 flex flex-col gap-2.5 text-sm text-muted-foreground">
                <Row
                  label="주소"
                  value={caseRow?.property?.roadAddress ?? caseRow?.title ?? "—"}
                />
                <Row
                  label="채권최고액"
                  value={valuation?.seniorClaimsKrw ? `${toMan(valuation.seniorClaimsKrw)}만원` : "—"}
                />
                <Row
                  label="추정 시세"
                  value={
                    valuation?.marketPrice && valuation.marketPrice.source !== "unavailable"
                      ? `${toMan(valuation.marketPrice.estimatedKrw)}만원`
                      : "확인 불가"
                  }
                />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">왜 물어보나요</p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                보증금은 전세가율 계산에, 일정은 확정일자·전입신고 알림에 사용합니다.
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground-light">
              입력한 값은 이 검사 건에 저장되어 판정에 사용됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-muted-foreground-light">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function DateRow({
  label,
  required = false,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <p className="w-28 shrink-0 text-sm">
        {label} {required && <span className="text-danger">*</span>}
      </p>
      <div
        className={
          value
            ? "flex flex-1 justify-between rounded-[11px] border-[1.5px] border-brand-primary px-3.5 py-3 text-sm"
            : "flex flex-1 justify-between rounded-[11px] border border-border px-3.5 py-3 text-sm"
        }
      >
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent font-medium outline-none"
        />
      </div>
    </div>
  );
}
