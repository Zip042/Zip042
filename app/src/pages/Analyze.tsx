import { Link } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";

const CHECK_ITEMS = [
  "소유자 정보와 변동 이력",
  "근저당권 · 채권최고액",
  "가압류 · 경매 · 신탁등기",
  "전세가율 (실거래 시세 대조)",
  "임차권등기명령 이력",
];

export default function Analyze() {
  return (
    <div className="border-b border-border bg-background-alt">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={0} />

        <div className="mt-7 grid grid-cols-1 items-start gap-8 md:grid-cols-[1fr_320px]">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">등기부등본을 올려주세요</h1>
            <p className="mt-2 text-sm text-muted-foreground-light">
              인터넷등기소에서 발급한 열람본이면 됩니다. PDF · 10MB 이하.
            </p>

            <div className="mt-5 rounded-2xl border-2 border-dashed border-brand-primary/45 bg-white px-8 py-12 text-center">
              <p className="font-display text-lg font-extrabold">여기로 파일을 끌어다 놓으세요</p>
              <p className="mt-1.5 text-sm text-muted-foreground-light">또는</p>
              <Button type="button" className="mt-3.5 rounded-[11px] bg-brand-primary hover:bg-brand-primary-hover">
                파일 선택
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-white px-5 py-4.5">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold">등기부등본_역삼동302.pdf</p>
                <p className="text-sm font-bold text-brand-primary">분석 중 62%</p>
              </div>
              <Progress value={62} className="mt-3 bg-border" />
              <p className="mt-2 text-xs text-muted-foreground-light">
                권리관계 항목을 대조하고 있습니다 · 약 20초 남음
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white p-5.5">
            <p className="text-sm font-bold">무엇을 확인하나요</p>
            <div className="mt-3.5 flex flex-col gap-2 text-sm text-muted-foreground">
              {CHECK_ITEMS.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <p className="mt-4.5 border-t border-border pt-3.5 text-xs leading-relaxed text-muted-foreground-light">
              업로드한 파일은 분석이 끝나면 즉시 삭제됩니다. 분석 결과는 참고용이며 법적 효력이 없습니다.
            </p>
            <Button asChild className="mt-4.5 w-full rounded-[11px] bg-brand-primary hover:bg-brand-primary-hover">
              <Link to="/analyze/documents">다음으로 (데모)</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
