import Stage from "./Stage";
import { GRADE, type Grade } from "@/components/ui";
import { useInView } from "@/components/motion";

/* ══════════════════════════════════════════════════════════════════════
   3. 대항력 공백 — 날짜 사이가 비면 보증금이 밀립니다
   ══════════════════════════════════════════════════════════════════ */

export function GapTimeline() {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Stage
      title={
        <>
          잔금 낸 날부터
          <br />
          <span className="text-stop-600">4일간 무방비입니다</span>
        </>
      }
    >
      <div ref={ref} className="mx-auto max-w-4xl">
        {/* 타임라인 */}
        <div className="relative">
          <div className="flex h-24 overflow-hidden rounded-2xl sm:h-28">
            <div className="flex w-[26%] flex-col justify-center bg-ink-900 px-5">
              <span className="text-[11px] text-white/50">9월 14일</span>
              <span className="text-[14px] font-bold text-white sm:text-[16px]">잔금 지급</span>
            </div>

            {/* 빈 구간 */}
            <div
              className={`relative flex flex-1 flex-col items-center justify-center bg-stop-50 ${
                inView ? "gapflow" : ""
              }`}
            >
              <span className="tnum text-[24px] font-bold text-stop-600 sm:text-[30px]">4일</span>
              <span className="text-[11.5px] font-semibold text-stop-600">대항력 없음</span>
            </div>

            <div className="flex w-[26%] flex-col justify-center bg-brand-500 px-5">
              <span className="text-[11px] text-white/70">9월 19일 0시</span>
              <span className="text-[14px] font-bold text-white sm:text-[16px]">대항력 발생</span>
            </div>
          </div>

          {/* 위험 표시 */}
          {inView && (
            <div className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="pulsing grid size-7 place-items-center rounded-full bg-stop-500 text-[14px] font-bold text-white">
                !
              </span>
            </div>
          )}
        </div>

        {/* 해법 한 줄 */}
        <div className="mt-8 rounded-2xl bg-brand-50 px-6 py-5 text-center">
          <p className="text-[15px] font-bold text-brand-700 sm:text-[17px]">
            잔금일 당일에 전입신고하면 사라지는 위험입니다
          </p>
        </div>
      </div>
    </Stage>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   4. 네 등급 — '모른다'는 '괜찮다'가 아닙니다
   ══════════════════════════════════════════════════════════════════ */

const GRADES: { grade: Grade; head: string; sub: string }[] = [
  { grade: "OK", head: "이상 없음", sub: "확인했고 문제없음" },
  { grade: "UNKNOWN", head: "판단 불가", sub: "정보가 없어 판단 못 함" },
  { grade: "WARN", head: "확인 필요", sub: "조건을 걸면 막을 수 있음" },
  { grade: "STOP", head: "멈춤", sub: "이대로 계약하면 안 됨" },
];

export function Grades() {
  return (
    <Stage
      tone="dark"
      title={
        <>
          모른다를
          <br />
          <span className="text-white/35">괜찮다로 바꾸지 않습니다</span>
        </>
      }
    >
      <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GRADES.map((g, i) => {
          const g2 = GRADE[g.grade];
          return (
            <div
              key={g.grade}
              className="rollin rounded-3xl bg-white/[0.06] p-7 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/[0.1]"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className={`block size-3 rounded-full ${g2.dot}`} />
              <p className="mt-6 text-[22px] font-bold tracking-[-0.02em] text-white">{g.head}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-white/45">{g.sub}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-10 text-center text-[13.5px] text-mute-500">
        종합 등급은 <span className="font-semibold text-mute-400">가장 나쁜 항목</span>을 따릅니다.
        평균이 아닙니다.
      </p>
    </Stage>
  );
}
