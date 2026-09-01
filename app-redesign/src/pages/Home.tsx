import { useEffect, useState } from "react";
import { ArrowRight, ArrowDown, FileText, ScanLine, Scale, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui";
import { Reveal } from "@/components/motion";
import ScrollStory from "@/components/ScrollStory";
import AuctionSim from "@/components/AuctionSim";
import Stage from "@/components/sections/Stage";
import { ScanSection, CancelTrap } from "@/components/sections/Extraction";
import { GapTimeline, Grades } from "@/components/sections/Judgment";

/**
 * 긴 스크롤 랜딩.
 *
 * 한 화면에 하나씩만 둡니다. 사람들은 랜딩을 정독하지 않고 훑기 때문에,
 * 문장으로 설득하는 대신 **장면을 넘기며 이해시키는** 구조로 잡았습니다.
 * 각 구획은 그림이 주인공이고 글은 제목 한 줄 수준으로만 남깁니다.
 */
export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Hero />
      <ScrollStory />
      <ScanSection />
      <CancelTrap />
      <GapTimeline />
      <Simulator />
      <Grades />
      <How />
      <Closing />
    </>
  );
}

/** 상단 진행 막대 — 페이지가 길어서 어디쯤인지 알려줍니다. */
function ScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setP(h > 0 ? Math.min(window.scrollY / h, 1) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent">
      <div
        className="h-full origin-left bg-brand-500 transition-transform duration-150"
        style={{ transform: `scaleX(${p})` }}
      />
    </div>
  );
}

/* ── 히어로 ───────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="blob absolute -left-[10%] -top-[20%] size-[720px] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--color-brand-100), transparent 65%)" }}
        />
        <div
          className="blob absolute -right-[12%] top-[8%] size-[620px] rounded-full opacity-45 blur-3xl"
          style={{
            background: "radial-gradient(circle, var(--color-stop-100), transparent 65%)",
            animationDelay: "-7s",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(70% 55% at 50% 40%, #000 0%, transparent 100%)",
          }}
        />
      </div>

      <div className="mx-auto grid min-h-screen max-w-[1500px] items-center gap-14 px-6 py-24 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:px-12">
        <div>
          <span className="rise inline-flex items-center gap-2 rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-[12.5px] font-semibold text-brand-700 backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-brand-500" />
            청년 전세사기 예방 서비스
          </span>

          <h1
            className="rise mt-7 text-[clamp(44px,6.2vw,88px)] font-bold leading-[1.03] tracking-[-0.04em]"
            style={{ animationDelay: "90ms" }}
          >
            보증금,
            <br />
            <span className="shine">돌려받을 수</span>
            <br />
            있나요?
          </h1>

          <div className="rise mt-9 flex flex-wrap gap-3" style={{ animationDelay: "280ms" }}>
            <Button to="/analyze" size="lg">
              지금 확인하기
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="relative">
          <HeroCards />
        </div>
      </div>

      <div
        className="fadein absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 text-ink-300"
        style={{ animationDelay: "900ms" }}
      >
        <span className="text-[12px]">스크롤</span>
        <ArrowDown className="size-4 animate-bounce" />
      </div>
    </section>
  );
}

function HeroCards() {
  return (
    <div className="relative mx-auto h-[420px] w-full max-w-lg sm:h-[460px]">
      <div
        className="popin absolute inset-x-0 top-6 rounded-3xl border border-line bg-white p-7 shadow-[0_2px_4px_rgba(16,24,21,.03),0_24px_64px_-24px_rgba(16,24,21,.22)]"
        style={{ animationDelay: "420ms" }}
      >
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-warn-500" />
          <span className="text-[12.5px] font-semibold text-warn-600">확인 필요</span>
        </div>
        <p className="mt-3 text-[21px] font-bold leading-snug tracking-[-0.02em]">
          계약 전에 확인할 것이 있습니다
        </p>

        <div className="mt-6 space-y-3">
          <MiniBar label="선순위 채권" value="2.4억" pct={46} tone="dark" />
          <MiniBar label="내 보증금" value="1.5억" pct={29} tone="brand" />
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12.5px] text-ink-500">시세 대비 부담</span>
            <span className="tnum text-[24px] font-bold">75%</span>
          </div>
          <div className="relative mt-2.5 h-2 rounded-full bg-mute-100">
            <div className="h-full w-[75%] rounded-full bg-brand-500" />
            <div className="absolute inset-y-[-4px] left-[80%] w-px bg-stop-500" />
          </div>
        </div>
      </div>

      <div
        className="popin floaty absolute -left-4 bottom-4 w-[248px] rounded-2xl border border-line bg-white p-4 shadow-[0_16px_40px_-16px_rgba(16,24,21,.28)] sm:-left-10"
        style={{ animationDelay: "620ms" }}
      >
        <div className="flex items-center gap-2 text-[11.5px] font-semibold text-mute-600">
          <ScanLine className="size-3.5" />
          AI 판독
        </div>
        <p className="mt-2 text-[13px] font-bold text-mute-500 line-through decoration-mute-400">
          근저당 3.6억
        </p>
        <p className="mt-1 text-[11.5px] text-mute-500">말소됨 — 계산에서 제외</p>
      </div>

      <div
        className="popin floaty absolute -right-2 top-0 w-[220px] rounded-2xl border border-brand-200 bg-brand-50 p-4 sm:-right-8"
        style={{ animationDelay: "760ms", animationDuration: "6s" }}
      >
        <div className="flex items-center gap-2 text-[11.5px] font-semibold text-brand-700">
          <ShieldCheck className="size-3.5" />
          이렇게 하세요
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-brand-700/90">
          특약에 &lsquo;잔금일까지 근저당 말소&rsquo;를 넣으세요
        </p>
      </div>
    </div>
  );
}

function MiniBar({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: string;
  pct: number;
  tone: "dark" | "brand";
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-ink-500">{label}</span>
        <span className="tnum font-semibold">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-mute-100">
        <div
          className={`h-full rounded-full ${tone === "dark" ? "bg-ink-900" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── 시뮬레이터 ───────────────────────────────────────────────────────── */
function Simulator() {
  return (
    <Stage
      tone="surface"
      title={
        <>
          내 상황이라면
          <br />
          <span className="text-ink-300">어떻게 될까요?</span>
        </>
      }
    >
      <div className="mx-auto max-w-4xl">
        <AuctionSim />
      </div>
    </Stage>
  );
}

/* ── 3단계 ───────────────────────────────────────────────────────────── */
const STEPS = [
  { icon: FileText, n: "01", title: "올리기", body: "등기부등본 PDF" },
  { icon: ScanLine, n: "02", title: "읽기", body: "AI가 판독" },
  { icon: Scale, n: "03", title: "판단", body: "법 조문 기반 규칙" },
];

function How() {
  return (
    <Stage title="세 단계로 끝납니다">
      <ol className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s.n}
            className="rollin group h-full rounded-3xl border border-line bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[0_20px_48px_-20px_rgba(16,24,21,.18)]"
            style={{ animationDelay: `${i * 110}ms` }}
          >
            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 transition-colors group-hover:bg-brand-500">
                <s.icon
                  className="size-5 text-brand-600 transition-colors group-hover:text-white"
                  strokeWidth={2}
                />
              </span>
              <span className="tnum text-[13px] font-bold text-ink-300">{s.n}</span>
            </div>
            <h3 className="mt-6 text-[24px] font-bold tracking-[-0.02em]">{s.title}</h3>
            <p className="mt-2 text-[14px] text-ink-500">{s.body}</p>
          </li>
        ))}
      </ol>
    </Stage>
  );
}

/* ── 마무리 ──────────────────────────────────────────────────────────────
   ⚠️ 통계를 넣으려면 출처가 있는 수치만 쓰세요(HUG 보도자료 등). */
function Closing() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden border-t border-line">
      <div
        aria-hidden
        className="blob pointer-events-none absolute inset-x-0 -bottom-40 -z-10 mx-auto size-[720px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-brand-100), transparent 65%)" }}
      />
      <div className="mx-auto max-w-3xl px-6 py-28 text-center">
        <Reveal>
          <h2 className="text-[clamp(34px,4.6vw,64px)] font-bold leading-[1.08] tracking-[-0.04em]">
            등기부에 다 적혀 있습니다.
            <br />
            <span className="text-ink-300">읽는 법을 몰랐을 뿐입니다.</span>
          </h2>

          <div className="mt-12">
            <Button to="/analyze" size="lg">
              내 계약 확인하기
              <ArrowRight className="size-4" />
            </Button>
          </div>

          <p className="mt-5 text-[12.5px] text-ink-300">회원가입 없이 바로 확인</p>
        </Reveal>
      </div>
    </section>
  );
}
