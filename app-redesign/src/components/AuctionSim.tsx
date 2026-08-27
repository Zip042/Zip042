import { useState } from "react";


/**
 * 경매 배당 시뮬레이션.
 *
 * 전세사기가 왜 무서운지는 문장으로 설명하기 어렵습니다. 실제 구조는 단순합니다 —
 * **집이 경매로 팔리면 정해진 순서대로 돈을 가져가고, 내 차례에 남아 있지 않으면 못 받습니다.**
 * 그래서 글 대신 그 순서를 그대로 보여줍니다.
 *
 * 사람들이 가장 많이 놓치는 두 가지를 화면에 넣었습니다.
 *   1. 경매 낙찰가는 시세보다 낮습니다. "시세가 5억이니 괜찮겠지"가 무너지는 지점입니다.
 *   2. 은행이 먼저입니다. 내 보증금은 그 다음입니다.
 *
 * 슬라이더로 선순위 채권을 올려 보면 내 몫이 잘려 나가는 것이 눈에 보입니다.
 */

const MARKET = 52_000; // 시세 (만원)
const DEPOSIT = 15_000; // 내 보증금 (만원)
const RECOVERY = 0.8; // 낙찰가율 — 실제 경매는 시세보다 낮게 팔립니다

const man = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}만원`;
const eok = (v: number) => `${(v / 10_000).toFixed(1)}억`;

export default function AuctionSim() {
  const [senior, setSenior] = useState(24_000);

  const auction = MARKET * RECOVERY;
  const leftForMe = Math.max(auction - senior, 0);
  const recovered = Math.min(leftForMe, DEPOSIT);
  const lost = DEPOSIT - recovered;
  const safe = lost === 0;

  // 막대 폭은 낙찰가를 100%로 봅니다 — 실제로 나눠 가질 수 있는 돈이 그것뿐이기 때문입니다.
  const pct = (v: number) => `${Math.min((v / auction) * 100, 100)}%`;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white">
      {/* 1단계 — 시세가 아니라 낙찰가 */}
      <div className="border-b border-line px-6 py-6 sm:px-9 sm:py-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[12.5px] text-ink-300">시세</p>
            <p className="tnum text-[19px] font-bold text-ink-300 line-through decoration-ink-300/50">
              {eok(MARKET)}
            </p>
          </div>
          <div className="text-ink-300">→</div>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-700">경매 낙찰가</p>
            <p className="tnum text-[26px] font-bold leading-none">{eok(auction)}</p>
          </div>
        </div>
      </div>

      {/* 2단계 — 순서대로 가져갑니다 */}
      <div className="px-6 py-7 sm:px-9">
        <p className="mb-4 text-[13px] font-semibold text-ink-700">
          이 돈을 <span className="text-brand-600">순서대로</span> 나눠 갖습니다
        </p>

        <div className="flex h-16 w-full overflow-hidden rounded-xl bg-mute-100">
          {/* 선순위 — 은행이 먼저 */}
          <div
            className="flex items-center justify-center bg-ink-900 transition-[width] duration-500 ease-out"
            style={{ width: pct(senior) }}
          >
            <span className="truncate px-2 text-[11.5px] font-semibold text-white/90">
              은행 {eok(senior)}
            </span>
          </div>

          {/* 내 보증금 중 받는 부분 */}
          <div
            className="flex items-center justify-center bg-brand-500 transition-[width] duration-500 ease-out"
            style={{ width: pct(recovered) }}
          >
            <span className="truncate px-2 text-[11.5px] font-semibold text-white">
              {recovered > 0 ? `내 몫 ${eok(recovered)}` : ""}
            </span>
          </div>

          {/* 못 받는 부분 — 빗금으로 '없는 돈'임을 표시 */}
          {lost > 0 && (
            <div
              className="flex items-center justify-center bg-stop-500 transition-[width] duration-500 ease-out"
              style={{
                width: pct(lost),
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.22) 0 6px, transparent 6px 12px)",
              }}
            >
              <span className="truncate px-2 text-[11.5px] font-bold text-white">
                못 받음
              </span>
            </div>
          )}
        </div>

        {/* 범례 */}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-ink-500">
          <Legend color="bg-ink-900" label="1순위 은행 (근저당)" />
          <Legend color="bg-brand-500" label="2순위 내 보증금" />
          {lost > 0 && <Legend color="bg-stop-500" label="돌려받지 못하는 돈" />}
        </div>

        {/* 조작 */}
        <div className="mt-7 rounded-2xl bg-surface px-5 py-5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="senior" className="text-[13px] font-semibold">
              집주인의 빚 (선순위 근저당)
            </label>
            <span className="tnum text-[15px] font-bold">{eok(senior)}</span>
          </div>

          <input
            id="senior"
            type="range"
            min={0}
            max={42_000}
            step={1_000}
            value={senior}
            onChange={(e) => setSenior(Number(e.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-mute-200 accent-brand-500"
          />

          <p className="mt-2.5 text-[12px] text-ink-300">
            직접 움직여 보세요. 빚이 늘어날수록 내 보증금이 잘려 나갑니다.
          </p>
        </div>

        {/* 결과 */}
        <div
          className={`mt-5 rounded-2xl px-5 py-5 transition-colors duration-300 ${
            safe ? "bg-brand-50" : "bg-stop-50"
          }`}
        >
          {safe ? (
            <>
              <p className="text-[14px] font-bold text-brand-700">
                보증금 {eok(DEPOSIT)}을 모두 돌려받습니다
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-brand-700/80">
                은행이 먼저 가져가도 내 차례에 {eok(leftForMe)}이 남아 있습니다.
              </p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-bold text-stop-700">
                <span className="tnum">{man(lost)}</span>을 돌려받지 못합니다
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-stop-700/80">
                내 차례에는 {leftForMe > 0 ? eok(leftForMe) : "한 푼도"} 남지 않습니다.
                보증금 {eok(DEPOSIT)} 중 {eok(recovered)}만 받습니다.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}
