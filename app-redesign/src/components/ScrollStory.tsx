import { useEffect, useRef, useState } from "react";

/**
 * 스크롤로 진행되는 경매 배당 설명.
 *
 * 왼쪽 그림을 화면에 고정해 두고, 오른쪽 문장이 지나갈 때마다 그림이 바뀝니다.
 * 애플·스트라이프 제품 페이지가 쓰는 방식입니다. 이 서비스에 특히 맞는 이유는,
 * 전세사기의 핵심이 **"순서"** 라서 시간 축을 따라 보여줘야 이해되기 때문입니다.
 *
 * 글로 쓰면 다섯 문단이 필요한 내용을 다섯 장면으로 대신합니다.
 */

const MARKET = 52_000; // 시세 (만원)
const RECOVERY = 0.8;
const AUCTION = MARKET * RECOVERY; // 41,600
const SENIOR = 24_000; // 은행 근저당
const DEPOSIT = 15_000; // 내 보증금
const BAD_SENIOR = 36_000; // 빚이 많은 경우

const eok = (v: number) => `${(v / 10_000).toFixed(1)}억`;

const SCENES = [
  {
    key: "market",
    tag: "01",
    title: "집값은 5.2억입니다",
    body: "계약하려는 집의 시세입니다. 여기까지는 아무 문제가 없어 보입니다.",
  },
  {
    key: "auction",
    tag: "02",
    title: "경매에 넘어가면 4.2억이 됩니다",
    body: "경매는 시세대로 팔리지 않습니다. 통상 80% 안팎에 낙찰됩니다. 1억이 먼저 증발합니다.",
  },
  {
    key: "senior",
    tag: "03",
    title: "은행이 먼저 가져갑니다",
    body: "등기부 을구에 적힌 근저당입니다. 순서가 앞서면 무조건 먼저입니다.",
  },
  {
    key: "mine",
    tag: "04",
    title: "그 다음이 내 보증금입니다",
    body: "남은 돈에서 받습니다. 지금은 1.8억이 남아 1.5억을 다 받을 수 있습니다.",
  },
  {
    key: "danger",
    tag: "05",
    title: "빚이 3.6억이었다면?",
    body: "남는 돈은 0.6억뿐입니다. 보증금 1.5억 중 9천만원을 돌려받지 못합니다.",
  },
] as const;

export default function ScrollStory() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    // 계산은 스크롤 핸들러에서 바로 합니다. requestAnimationFrame 으로 미루면
    // 프레임이 그려지지 않는 상황(백그라운드 탭 등)에서 장면이 멈춥니다.
    // 비용은 getBoundingClientRect 한 번뿐이고, 장면 번호가 실제로 바뀔 때만
    // 리렌더하므로 이대로도 가볍습니다.
    let last = -1;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const p = Math.min(Math.max(-rect.top / total, 0), 1);
      const next = Math.min(Math.floor(p * SCENES.length), SCENES.length - 1);
      if (next !== last) {
        last = next;
        setScene(next);
      }
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
    <div ref={wrapRef} className="relative" style={{ height: `${SCENES.length * 90}vh` }}>
      <div className="sticky top-0 flex min-h-screen items-center">
        <div className="mx-auto grid w-full max-w-[1500px] gap-12 px-6 lg:grid-cols-[1.15fr_.85fr] lg:gap-20 lg:px-12">
          {/* 그림 — 고정 */}
          <div className="order-2 lg:order-1">
            <Visual scene={scene} />
          </div>

          {/* 문장 — 장면에 따라 바뀜 */}
          <div className="order-1 flex flex-col justify-center lg:order-2">
            <ol className="space-y-7">
              {SCENES.map((s, i) => {
                const active = i === scene;
                return (
                  <li
                    key={s.key}
                    className={`transition-all duration-500 ${
                      active ? "opacity-100" : "opacity-25"
                    }`}
                  >
                    <div className="flex gap-4">
                      <span
                        className={`tnum mt-1 text-[12px] font-bold transition-colors ${
                          active ? "text-brand-500" : "text-ink-300"
                        }`}
                      >
                        {s.tag}
                      </span>
                      <div>
                        <h3
                          className={`text-[19px] font-bold leading-snug tracking-[-0.02em] transition-all duration-500 sm:text-[23px] ${
                            active && s.key === "danger" ? "text-stop-600" : ""
                          }`}
                        >
                          {s.title}
                        </h3>
                        <p
                          className={`mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink-500 transition-all duration-500 ${
                            active ? "max-h-24" : "max-h-0 overflow-hidden opacity-0"
                          }`}
                        >
                          {s.body}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 장면별 그림 ─────────────────────────────────────────────────────── */

function Visual({ scene }: { scene: number }) {
  const danger = scene >= 4;
  const senior = danger ? BAD_SENIOR : SENIOR;
  const barTotal = scene === 0 ? MARKET : AUCTION;

  const leftForMe = Math.max(AUCTION - senior, 0);
  const recovered = Math.min(leftForMe, DEPOSIT);
  const lost = DEPOSIT - recovered;

  const w = (v: number) => `${Math.min((v / barTotal) * 100, 100)}%`;

  return (
    <div className="relative">
      {/* 배경 광원 — 위험 장면에서 붉게 */}
      <div
        aria-hidden
        className={`blob pointer-events-none absolute -inset-16 -z-10 rounded-full opacity-50 blur-3xl transition-colors duration-1000 ${
          danger ? "bg-stop-100" : "bg-brand-100"
        }`}
      />

      {/* 금액 헤드라인 */}
      <div className="mb-7 flex items-end gap-4">
        <div>
          <p className="text-[12px] font-semibold tracking-wide text-ink-300">
            {scene === 0 ? "시세" : "경매 낙찰가"}
          </p>
          <p className="tnum text-[52px] font-bold leading-none tracking-[-0.04em] transition-all duration-700 sm:text-[68px]">
            {eok(barTotal)}
          </p>
        </div>
        {scene >= 1 && (
          <p className="popin mb-2 rounded-full bg-stop-50 px-3 py-1.5 text-[12px] font-bold text-stop-600">
            −{eok(MARKET - AUCTION)} 증발
          </p>
        )}
      </div>

      {/* 배당 막대 */}
      <div className="relative h-28 w-full overflow-hidden rounded-2xl bg-mute-100 sm:h-32">
        <div className="flex h-full">
          {/* 은행 */}
          {scene >= 2 && (
            <div
              className="slidein flex flex-col justify-center bg-ink-900 px-4 transition-[width] duration-700 ease-out"
              style={{ width: w(senior) }}
            >
              <span className="text-[11px] font-medium text-white/50">1순위 은행</span>
              <span className="tnum truncate text-[17px] font-bold text-white sm:text-[20px]">
                {eok(senior)}
              </span>
            </div>
          )}

          {/* 내 보증금 */}
          {scene >= 3 && recovered > 0 && (
            <div
              className="slidein flex flex-col justify-center bg-brand-500 px-4 transition-[width] duration-700 ease-out"
              style={{ width: w(recovered), animationDelay: "120ms" }}
            >
              <span className="text-[11px] font-medium text-white/70">2순위 내 보증금</span>
              <span className="tnum truncate text-[17px] font-bold text-white sm:text-[20px]">
                {eok(recovered)}
              </span>
            </div>
          )}

          {/* 못 받는 돈 */}
          {danger && lost > 0 && (
            <div
              className="popin flex flex-col justify-center px-4 transition-[width] duration-700 ease-out"
              style={{
                width: w(lost),
                backgroundColor: "var(--color-stop-500)",
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.25) 0 7px, transparent 7px 14px)",
                animationDelay: "220ms",
              }}
            >
              <span className="text-[11px] font-medium text-white/80">못 받음</span>
              <span className="tnum truncate text-[17px] font-bold text-white sm:text-[20px]">
                {eok(lost)}
              </span>
            </div>
          )}
        </div>

        {/* 아직 나뉘기 전 안내 */}
        {scene < 2 && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="text-[13px] font-medium text-ink-300">
              이 돈을 순서대로 나눠 갖습니다
            </span>
          </div>
        )}
      </div>

      {/* 결과 배지 */}
      {scene >= 3 && (
        <div
          key={danger ? "bad" : "good"}
          className={`popin mt-6 inline-flex items-center gap-2.5 rounded-2xl px-5 py-4 ${
            danger ? "bg-stop-50" : "bg-brand-50"
          }`}
        >
          <span
            className={`grid size-8 place-items-center rounded-full text-[15px] font-bold text-white ${
              danger ? "bg-stop-500" : "bg-brand-500"
            }`}
          >
            {danger ? "!" : "✓"}
          </span>
          <span
            className={`text-[14px] font-bold ${danger ? "text-stop-700" : "text-brand-700"}`}
          >
            {danger
              ? `보증금 ${eok(lost)}을 잃습니다`
              : `보증금 ${eok(DEPOSIT)}을 모두 지킵니다`}
          </span>
        </div>
      )}
    </div>
  );
}
