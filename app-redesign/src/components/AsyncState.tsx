import { Loader2 } from "lucide-react";
import { Button, Card } from "./ui";

/**
 * 화면이 데이터를 기다리거나 실패했을 때 쓰는 공통 표시.
 *
 * 실패를 조용히 넘기지 않는 것이 이 서비스의 원칙이라, 빈 화면 대신 무엇이
 * 잘못됐고 무엇을 할 수 있는지 항상 보여줍니다.
 */

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-5 py-24 text-center">
      <Loader2 className="size-6 animate-spin text-brand-500" />
      <p className="mt-4 text-[14px] text-ink-500">{label}</p>
    </div>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <Card className="border-stop-200 bg-stop-50 p-6">
        <p className="text-[15px] font-bold text-stop-700">결과를 불러오지 못했습니다</p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-stop-700/85">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          {onRetry && <Button onClick={onRetry}>다시 시도</Button>}
          <Button to="/analyze" variant="ghost">
            처음부터 다시
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** 검사 건 자체가 없을 때 (새로고침으로 흐름을 잃은 경우 등). */
export function NoCase() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <p className="text-[15px] text-ink-500">검사 건이 없습니다. 등기부등본부터 올려주세요.</p>
      <Button to="/analyze" className="mt-6">
        검사 시작하기
      </Button>
    </div>
  );
}
