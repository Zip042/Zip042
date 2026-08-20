import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const RISK_ITEMS = [
  {
    level: "danger" as const,
    title: "전세가율 108%",
    desc: "시세 2.4억 · 채권최고액 1.6억 + 보증금 1.0억. 경매 시 보증금 회수가 어렵습니다.",
  },
  { level: "danger" as const, title: "근저당권 설정 (2건)" },
  { level: "danger" as const, title: "소유권 이전 3개월 이내" },
  { level: "safe" as const, title: "가압류 · 경매 기입등기 없음" },
  { level: "safe" as const, title: "신탁등기 없음 · 소유자 명의 일치" },
];

const LEVEL_STYLE = {
  danger: {
    badge: "destructive" as const,
    label: "위험",
    border: "border-semantic-danger-border",
    bg: "bg-semantic-danger-bg",
  },
  safe: {
    badge: "success" as const,
    label: "정상",
    border: "border-semantic-safe-border",
    bg: "bg-semantic-safe-bg",
  },
};

export default function AnalyzeResult() {
  const dangerCount = RISK_ITEMS.filter((i) => i.level === "danger").length;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <p className="mb-4 text-sm text-muted-foreground">
        서울 강남구 역삼동 ○○빌라 302호 · 2026.08.20 분석
      </p>

      <div className="mb-8 flex items-center gap-5 rounded-lg border-2 border-semantic-danger bg-semantic-danger-bg p-6">
        <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-semantic-danger text-semantic-danger">
          <span className="font-display text-2xl font-extrabold">위험</span>
          <span className="text-xs">{dangerCount}/5 항목</span>
        </div>
        <div>
          <h1 className="font-display text-xl font-extrabold text-semantic-danger">
            계약 전 반드시 확인이 필요합니다
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            채권최고액과 보증금 합계가 시세의 <strong>108%</strong>입니다. 보증금을 돌려받지 못할 가능성이 큽니다.
          </p>
          <div className="mt-3 flex gap-2">
            <Button className="bg-semantic-danger text-white hover:bg-semantic-danger/90">
              대처 방법 보기
            </Button>
            <Button variant="outline">PDF로 저장</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]">
        <div className="flex flex-col gap-3">
          <h2 className="font-display font-bold">항목별 판정</h2>
          {RISK_ITEMS.map((item) => {
            const style = LEVEL_STYLE[item.level];
            return (
              <div key={item.title} className={`rounded-lg border p-3 ${style.border} ${style.bg}`}>
                <div className="flex items-center gap-2">
                  <Badge variant={style.badge}>{style.label}</Badge>
                  <span className="font-bold">{item.title}</span>
                </div>
                {"desc" in item && item.desc && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-bold">지금 할 일</p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              <li>1. 집주인에게 근저당 말소 요구</li>
              <li>2. 특약사항에 조건 명시</li>
              <li>3. 보증보험 가입 가능 여부 확인</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="mb-1 text-sm font-bold">전문가 상담</p>
            <p className="text-xs text-muted-foreground">공인중개사 · 법률 상담 연결</p>
            <Button variant="outline" className="mt-2 w-full">
              상담 신청
            </Button>
          </div>
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            본 결과는 참고용이며 법적 효력이 없습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
