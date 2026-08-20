import { Link } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

const CHECK_ITEMS = [
  "소유자 정보와 변동 이력",
  "근저당권 · 채권최고액",
  "가압류 · 경매 · 신탁",
  "전세가율 (시세 대조)",
  "임차권등기명령",
];

export default function Analyze() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <ol className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <li className="rounded-full bg-foreground px-3 py-1 text-background">1 업로드</li>
        <li>→</li>
        <li className="rounded-full border border-border px-3 py-1">2 분석</li>
        <li>→</li>
        <li className="rounded-full border border-border px-3 py-1">3 결과</li>
      </ol>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_260px]">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-xl font-bold">등기부등본을 올려주세요</h1>
          <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted px-6 py-10 text-center">
            <p className="font-bold">여기로 파일을 끌어다 놓기</p>
            <p className="text-sm text-muted-foreground">PDF · 인터넷등기소 열람본 (10MB 이하)</p>
            <Button variant="outline" className="mt-2">
              파일 선택
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between text-sm">
              <span>등기부등본_역삼동.pdf</span>
              <span className="text-brand-secondary">분석 중 62%</span>
            </div>
            <Progress value={62} className="mt-3" indicatorClassName="bg-brand-secondary" />
            <p className="mt-2 text-xs text-muted-foreground">권리관계 항목 대조 중 · 예상 20초</p>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 font-bold">서류가 없다면</p>
            <div className="flex gap-3">
              <Button variant="outline">주소로 조회하기</Button>
              <Button variant="outline">발급 방법 안내</Button>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-lg border border-border p-4">
          <p className="mb-2 font-bold">무엇을 확인하나요</p>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {CHECK_ITEMS.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
            업로드한 파일은 분석 후 즉시 삭제됩니다.
          </p>
          <Button asChild className="mt-4 w-full bg-brand-primary hover:bg-brand-primary-hover">
            <Link to="/analyze/result">결과 보기 (데모)</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
