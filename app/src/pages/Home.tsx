import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  { n: "1", title: "서류 올리기", desc: "등기부등본 PDF 업로드" },
  { n: "2", title: "자동 분석", desc: "권리관계·시세 대조" },
  { n: "3", title: "위험 리포트", desc: "항목별 판정과 대처법" },
];

const RISKS = [
  { level: "위험", text: "깡통전세 · 전세가율 90% 이상" },
  { level: "위험", text: "이중계약 · 대리인 위임장 위조" },
  { level: "사례", text: "신탁등기 물건 계약" },
];

const SAFE_TIPS = [
  { level: "확인", text: "전입신고 + 확정일자" },
  { level: "확인", text: "등기부 = 집주인 = 계좌주 일치" },
  { level: "확인", text: "전세보증금 반환보증 가입" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <section className="grid grid-cols-1 gap-8 border-b border-border pb-10 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <h1 className="font-display text-3xl font-extrabold leading-snug md:text-4xl">
            계약서에 도장 찍기 전,
            <br />
            <span className="text-brand-primary">30초 만에 위험 확인</span>
          </h1>
          <p className="text-muted-foreground">
            등기부등본을 올리면 근저당·가압류·전세가율을 자동으로 짚어드립니다.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="bg-brand-primary hover:bg-brand-primary-hover">
              <Link to="/analyze">등기부등본 분석하기</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/checklist">체크리스트 먼저 보기</Link>
            </Button>
          </div>
        </div>
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
          일러스트 / 이미지 자리
        </div>
      </section>

      <section className="border-b border-border py-10">
        <h2 className="mb-4 font-display text-lg font-bold">이렇게 확인합니다</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} className="border-border">
              <CardContent className="pt-6">
                <p className="font-bold">
                  {step.n} · {step.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 py-10 md:grid-cols-2">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">요즘 많이 당하는 수법</h2>
          <ul className="flex flex-col gap-2">
            {RISKS.map((risk, i) => (
              <li
                key={i}
                className={
                  risk.level === "위험"
                    ? "flex items-center gap-2 rounded-md border-l-4 border-brand-primary bg-brand-primary-light px-3 py-2 text-sm"
                    : "flex items-center gap-2 rounded-md border-l-4 border-border bg-muted px-3 py-2 text-sm"
                }
              >
                <span
                  className={
                    risk.level === "위험" ? "font-bold text-brand-primary" : "text-muted-foreground"
                  }
                >
                  {risk.level}
                </span>
                <span>{risk.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">사회초년생 필수 3가지</h2>
          <ul className="flex flex-col gap-2">
            {SAFE_TIPS.map((tip, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border-l-4 border-brand-secondary bg-brand-secondary-light px-3 py-2 text-sm"
              >
                <span className="font-bold text-brand-secondary">{tip.level}</span>
                <span>{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
