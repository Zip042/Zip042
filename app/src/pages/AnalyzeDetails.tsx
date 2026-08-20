import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";

export default function AnalyzeDetails() {
  return (
    <div className="border-b border-border bg-background-alt">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={2} skipped={[1]} />

        <h1 className="mt-7 font-display text-2xl font-black tracking-tight">계약 조건과 일정을 알려주세요</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          서류를 건너뛰셨기 때문에, 아래 내용을 입력하면 전세가율과 일정 위험을 함께 판정할 수 있습니다.
        </p>

        <div className="mt-6 grid grid-cols-1 items-start gap-7 md:grid-cols-[1fr_300px]">
          <div className="rounded-2xl border border-border bg-white p-7">
            <p className="text-xs font-bold tracking-wide text-muted-foreground-light">보증금 · 월세</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full bg-brand-primary px-4 py-2 text-sm font-bold text-white">월세</span>
              <span className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">전세</span>
              <span className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">반전세</span>
            </div>
            <div className="mt-4.5 grid grid-cols-2 gap-4">
              <div>
                <p className="mb-1.5 text-sm font-bold">
                  보증금 <span className="text-danger">*</span>
                </p>
                <div className="flex items-center justify-between rounded-[11px] border-[1.5px] border-brand-primary px-3.5 py-3">
                  <span className="font-bold">10,000</span>
                  <span className="text-sm text-muted-foreground-light">만원</span>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-bold">월세</p>
                <div className="flex items-center justify-between rounded-[11px] border border-border px-3.5 py-3 text-placeholder">
                  <span>0</span>
                  <span className="text-sm">만원</span>
                </div>
              </div>
            </div>

            <p className="mt-7.5 border-t border-border pt-6 text-xs font-bold tracking-wide text-muted-foreground-light">
              일정
            </p>
            <div className="mt-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-3.5">
                <p className="w-28 shrink-0 text-sm">
                  계약 예정일 <span className="text-danger">*</span>
                </p>
                <div className="flex flex-1 justify-between rounded-[11px] border-[1.5px] border-brand-primary px-3.5 py-3 text-sm">
                  <span className="font-medium">2026.09.05</span>
                  <span className="text-muted-foreground-light">달력</span>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <p className="w-28 shrink-0 text-sm">
                  잔금 예정일 <span className="text-danger">*</span>
                </p>
                <div className="flex flex-1 justify-between rounded-[11px] border-[1.5px] border-brand-primary px-3.5 py-3 text-sm">
                  <span className="font-medium">2026.10.02</span>
                  <span className="text-muted-foreground-light">달력</span>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <p className="w-28 shrink-0 text-sm">전입신고 예정일</p>
                <div className="flex flex-1 justify-between rounded-[11px] border border-border px-3.5 py-3 text-sm text-placeholder">
                  <span>2026.10.06</span>
                  <span className="text-muted-foreground-light">달력</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-xl border border-danger-border bg-white px-4.5 py-4">
              <Badge className="bg-danger">주의</Badge>
              <p className="text-sm leading-relaxed text-danger-text">
                잔금일과 전입신고일 사이 <strong>4일</strong>은 대항력이 없는 상태입니다. 같은 날로 맞추는 것을 권합니다.
              </p>
            </div>

            <div className="mt-6.5 flex flex-wrap items-center gap-3.5 border-t border-border pt-5.5">
              <Button asChild className="rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover">
                <Link to="/analyze/result">입력하고 결과 보기</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl border-border-strong">
                <Link to="/analyze/documents">서류 다시 올리기</Link>
              </Button>
              <p className="text-sm text-muted-foreground-light">보증금만 넣어도 진행할 수 있습니다.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">등기부에서 읽은 값</p>
              <div className="mt-3.5 flex flex-col gap-2.5 text-sm text-muted-foreground">
                <div className="flex justify-between">
                  <span className="text-muted-foreground-light">주소</span>
                  <span>역삼동 ○○빌라 302호</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground-light">채권최고액</span>
                  <span>1억 6,000만원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground-light">추정 시세</span>
                  <span>2억 4,000만원</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">왜 물어보나요</p>
              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
                보증금은 전세가율 계산에, 일정은 확정일자·전입신고 알림에 사용합니다.
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground-light">
              입력한 값은 저장하지 않고 이번 분석에만 사용합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
