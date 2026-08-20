import { Link } from "react-router";
import { Button } from "@/components/ui/button";

const RISKS = [
  { title: "깡통전세", desc: "전세가율 90% 이상", danger: true },
  { title: "이중계약 · 위임장 위조", desc: "대리인 계약", danger: true },
  { title: "신탁등기 물건 계약", desc: "신탁회사 동의 필요", danger: false },
];

const ESSENTIALS = [
  { n: "01", title: "전입신고 + 확정일자", desc: "잔금 치른 당일" },
  { n: "02", title: "등기부 소유자 = 계약자 = 계좌주", desc: "다르면 송금 금지" },
  { n: "03", title: "보증금 반환보증 가입", desc: "계약 전 가입 가능 여부 확인" },
];

export default function Home() {
  return (
    <div className="border-b border-border">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-8 py-20 md:grid-cols-[1.15fr_0.85fr]">
        <div>
          <h1 className="font-display text-4xl font-black leading-tight tracking-tight md:text-5xl">
            도장 찍기 전에,
            <br />
            등기부가 말하는
            <br />
            <span className="text-danger">위험</span>을 먼저 보세요
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground">
            등기부등본을 올리면 근저당·가압류·전세가율을 확인해 드립니다.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-xl bg-brand-primary px-7 hover:bg-brand-primary-hover">
              <Link to="/analyze">등기부등본 분석하기</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl border-border-strong">
              <Link to="/checklist">체크리스트 먼저 보기</Link>
            </Button>
          </div>
          <div className="mt-9 flex gap-7 text-sm text-muted-foreground-light">
            <span>분석 28초</span>
            <span>파일은 분석 후 즉시 삭제</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-6">
          <p className="text-xs font-bold tracking-wide text-muted-foreground-light">리포트 미리보기</p>
          <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-danger-border bg-white p-4.5">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-danger text-danger">
              <span className="font-display text-lg font-black leading-none">위험</span>
              <span className="text-[10px]">3 / 5</span>
            </div>
            <div>
              <p className="text-sm font-bold text-danger">전세가율 108%</p>
              <p className="mt-1 text-xs text-muted-foreground-light">선순위 채권이 시세를 넘습니다</p>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2.5 rounded-[10px] border border-border px-3.5 py-3 text-sm">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              근저당권 2건 설정
            </div>
            <div className="flex items-center gap-2.5 rounded-[10px] border border-border px-3.5 py-3 text-sm">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              소유권 이전 3개월 이내
            </div>
            <div className="flex items-center gap-2.5 rounded-[10px] border border-border px-3.5 py-3 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
              가압류·경매 기입등기 없음
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-8 pb-16">
        <div className="grid grid-cols-1 gap-14 border-t border-border pt-11 md:grid-cols-2">
          <div>
            <h2 className="font-display text-xl font-extrabold">요즘 많이 당하는 수법</h2>
            <div className="mt-4 flex flex-col gap-2.5">
              {RISKS.map((risk) => (
                <div
                  key={risk.title}
                  className={
                    risk.danger
                      ? "rounded-r-[10px] border-l-[3px] border-danger px-4 py-3.5"
                      : "border-l-[3px] border-border px-4 py-3.5"
                  }
                >
                  <p className={risk.danger ? "text-sm font-bold text-danger" : "text-sm font-bold"}>
                    {risk.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">{risk.desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-display text-xl font-extrabold">사회초년생 필수 3가지</h2>
            <div className="mt-4 flex flex-col gap-2.5">
              {ESSENTIALS.map((item) => (
                <div key={item.n} className="flex gap-3 rounded-[10px] border border-border px-4 py-3.5">
                  <span className="font-display font-black text-brand-primary">{item.n}</span>
                  <div>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
