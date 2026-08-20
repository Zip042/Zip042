import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const RISK_ITEMS = [
  { level: "danger" as const, title: "전세가율 108%", expanded: true },
  { level: "danger" as const, title: "근저당권 2건 설정 (2024.03 / 2025.11)" },
  { level: "danger" as const, title: "소유권 이전 3개월 이내 (2026.06.11)" },
  { level: "safe" as const, title: "가압류 · 경매 기입등기 없음" },
  { level: "safe" as const, title: "신탁등기 없음 · 등기부 소유자와 계약자 일치" },
];

export default function AnalyzeResult() {
  const dangerCount = RISK_ITEMS.filter((i) => i.level === "danger").length;

  return (
    <div className="border-b border-border">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center gap-7 px-8 py-10">
          <div className="flex h-[132px] w-[132px] shrink-0 flex-col items-center justify-center rounded-full border-[5px] border-danger text-danger">
            <span className="font-display text-3xl font-black leading-none">위험</span>
            <span className="mt-1 text-sm font-bold">5개 중 3개 항목</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-danger-text">
              서울 강남구 역삼동 ○○빌라 302호 · 2026.08.20 분석
            </p>
            <h1 className="mt-2 font-display text-[34px] font-black tracking-tight text-danger">
              계약 전 반드시 확인이 필요합니다
            </h1>
            <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-danger-text">
              채권최고액과 보증금 합계가 시세의 <strong>108%</strong>입니다. 이 상태로 계약하면 경매 시 보증금을
              돌려받지 못할 가능성이 큽니다.
            </p>
            <div className="mt-5 flex gap-3">
              <Button className="rounded-[11px] bg-danger px-6 hover:bg-danger/90">대처 방법 보기</Button>
              <Button variant="outline" className="rounded-[11px] border-border-strong bg-white">
                PDF로 저장
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-8 py-9 md:grid-cols-[1fr_300px]">
        <div>
          <h2 className="font-display text-xl font-extrabold">항목별 판정</h2>
          <div className="mt-4 flex flex-col gap-3">
            {RISK_ITEMS.map((item) => {
              const isDanger = item.level === "danger";
              return (
                <div
                  key={item.title}
                  className={
                    isDanger
                      ? "rounded-2xl border border-danger-border bg-white p-5"
                      : "flex items-center gap-2.5 rounded-2xl border border-border p-4.5"
                  }
                >
                  <div className="flex items-center gap-2.5">
                    {isDanger ? (
                      <Badge className="bg-danger">위험</Badge>
                    ) : (
                      <Badge variant="brand-outline">정상</Badge>
                    )}
                    <p className={isDanger ? "text-base font-bold" : "text-base font-medium text-muted-foreground"}>
                      {item.title}
                    </p>
                    {isDanger && (
                      <span className="ml-auto text-sm font-bold text-danger">
                        {item.expanded ? "접기" : "펼치기"}
                      </span>
                    )}
                  </div>
                  {item.expanded && (
                    <>
                      <p className="mt-2.5 text-sm leading-relaxed text-danger-text">
                        시세 2억 4,000만원 · 채권최고액 1억 6,000만원 + 보증금 1억원. 선순위 채권이 시세를 넘어,
                        경매 시 배당 순위에서 보증금 회수가 어렵습니다.
                      </p>
                      <div className="mt-3.5 flex h-2.5 overflow-hidden rounded-full border border-border bg-background-alt">
                        <div className="w-[67%] bg-danger" />
                        <div className="w-[41%] bg-danger/45" />
                      </div>
                      <div className="mt-2 flex gap-4.5 text-xs text-danger-text">
                        <span>채권최고액 67%</span>
                        <span>내 보증금 41%</span>
                        <span className="ml-auto font-bold">안전 기준 80% 이하</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <div className="rounded-2xl bg-background-alt p-5">
            <p className="text-sm font-bold">지금 할 일</p>
            <div className="mt-3.5 flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex gap-2.5">
                <span className="font-display font-black text-brand-primary">1</span>
                <p>집주인에게 근저당 말소를 요구하세요.</p>
              </div>
              <div className="flex gap-2.5">
                <span className="font-display font-black text-brand-primary">2</span>
                <p>특약사항에 "잔금일까지 근저당 말소" 조건을 넣으세요.</p>
              </div>
              <div className="flex gap-2.5">
                <span className="font-display font-black text-brand-primary">3</span>
                <p>보증금 반환보증 가입 가능 여부를 확인하세요.</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border p-5">
            <p className="text-sm font-bold">전문가 상담</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              공인중개사 · 법률 상담을 연결해 드립니다.
            </p>
            <Button variant="outline" className="mt-3.5 w-full rounded-[10px] border-border-strong">
              상담 신청
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground-light">
            본 결과는 등기부 기재사항을 기준으로 한 참고 정보이며 법적 효력이 없습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
