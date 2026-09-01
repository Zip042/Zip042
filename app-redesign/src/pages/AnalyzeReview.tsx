import { useEffect, useState } from "react";
import { ArrowRight, Quote, TriangleAlert, Check, Pencil } from "lucide-react";
import { Button, Card, PageHead, Steps, formatMan } from "@/components/ui";
import { Failed, Loading, NoCase } from "@/components/AsyncState";
import { useFlow } from "@/state/flow";
import { getExtraction } from "@/lib/zip042";
import { type ExtractedRight } from "@/data/sample";

/**
 * 판독 확인 — 판정을 보여주기 **전에** 사람이 원본과 대조하는 단계.
 *
 * AI가 채권최고액을 잘못 읽으면 판정 전체가 틀립니다. 특히 말소선이 그어진 근저당을
 * 살아 있는 것으로 읽으면 멀쩡한 집이 위험으로 뜹니다. 그래서 각 항목마다 등기부의
 * 어느 문장을 보고 그렇게 읽었는지를 함께 보여주고, 다르면 바로잡게 합니다.
 */
export default function AnalyzeReview() {
  const { caseId, extraction, setExtraction } = useFlow();
  const [corrections, setCorrections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!caseId || extraction) return;
    let alive = true;
    setLoading(true);
    getExtraction(caseId)
      .then((e) => alive && setExtraction(e))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [caseId, extraction, setExtraction]);

  if (!caseId) return <NoCase />;
  if (error) return <Failed message={error} onRetry={() => setError(null)} />;
  if (loading) return <Loading label="판독 결과를 불러오는 중…" />;

  // 판독 자체가 없는 경우 — "읽었는데 비었다"와 다릅니다. 판정으로 넘어갈 수는 있게 둡니다.
  if (!extraction) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Steps current={2} />
        <Card className="border-warn-200 bg-warn-50 p-6">
          <p className="text-[15px] font-bold text-warn-600">등기부를 판독하지 못했습니다</p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-warn-600/85">
            판독 결과가 없어 원본과 대조할 수 없습니다. 판정은 나머지 정보로만 계산됐으므로
            실제 위험은 표시된 것보다 클 수 있습니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button to="/analyze" variant="ghost">
              서류 다시 올리기
            </Button>
            <Button to="/analyze/result">
              그래도 판정 보기
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const x = extraction;

  const gap = x.rights.filter((r) => r.section === "gap");
  const eul = x.rights.filter((r) => r.section === "eul");
  const cancelledCount = x.rights.filter((r) => r.isCancelled).length;
  const flagged = Object.values(corrections).filter(Boolean).length;

  const markWrong = (key: string) =>
    setCorrections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <Steps current={2} />

      <PageHead
        eyebrow="판독 완료"
        title="등기부를 이렇게 읽었습니다"
        lead="판정을 보기 전에 원본과 맞는지 확인해 주세요. 한 줄이라도 다르면 판정이 달라집니다."
      />

      {/* 판독 요약 */}
      <Card className="mb-6 p-5">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Stat label="읽어낸 권리" value={`${x.rights.length}건`} />
          <Stat label="말소로 판단" value={`${cancelledCount}건`} />
          <Stat
            label="읽지 못한 부분"
            value={x.unreadableSections.length === 0 ? "없음" : `${x.unreadableSections.length}건`}
            tone={x.unreadableSections.length > 0 ? "warn" : "ok"}
          />
        </div>
      </Card>

      {x.unreadableSections.length > 0 && (
        <Card className="mb-6 border-warn-200 bg-warn-50 p-5">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-600" />
            <div>
              <p className="text-[13.5px] font-semibold text-warn-600">
                읽지 못한 부분이 있습니다
              </p>
              <ul className="mt-2 space-y-1">
                {x.unreadableSections.map((s) => (
                  <li key={s} className="text-[12.5px] text-warn-600/85">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* 부동산 표시 */}
      <Section title="어느 집인가">
        <dl className="divide-y divide-line">
          <InfoRow label="도로명주소" value={x.roadAddress} />
          <InfoRow label="지번주소" value={x.jibunAddress} />
          <InfoRow label="건물" value={x.buildingName} />
          <InfoRow
            label="전용면적"
            value={x.exclusiveAreaM2 ? `${x.exclusiveAreaM2}㎡` : null}
          />
        </dl>
      </Section>

      {/* 소유자 */}
      <Section title="누구 집인가 (갑구)">
        <dl className="divide-y divide-line">
          <InfoRow label="소유자" value={x.ownerNames.join(", ") || null} />
          <InfoRow label="소유권 취득일" value={x.ownershipAcquiredOn} />
          <InfoRow
            label="신탁 등기"
            value={x.isTrustProperty ? "있음" : "없음"}
            tone={x.isTrustProperty ? "warn" : undefined}
          />
        </dl>

        {gap.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {gap.map((r) => (
              <RightCard
                key={`gap-${r.rankNo}`}
                right={r}
                wrong={!!corrections[`gap-${r.rankNo}`]}
                onToggle={() => markWrong(`gap-${r.rankNo}`)}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* 을구 — 여기가 판정을 좌우합니다 */}
      <Section
        title="빚과 권리 (을구)"
        note="말소선이 그어진 항목은 회색으로 표시했습니다. 원본에 실제로 줄이 그어져 있는지 꼭 확인하세요."
      >
        <ul className="space-y-2.5">
          {eul.map((r) => (
            <RightCard
              key={`eul-${r.rankNo}`}
              right={r}
              wrong={!!corrections[`eul-${r.rankNo}`]}
              onToggle={() => markWrong(`eul-${r.rankNo}`)}
            />
          ))}
        </ul>
      </Section>

      {/* 확인 완료 */}
      <div className="mt-10">
        {flagged > 0 ? (
          <Card className="border-warn-200 bg-warn-50 p-5">
            <p className="text-[13.5px] font-semibold text-warn-600">
              {flagged}개 항목이 다르다고 표시되었습니다
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-warn-600/85">
              틀린 값으로 판정하면 결과를 믿을 수 없습니다. 서류를 다시 올리거나 값을
              직접 고친 뒤 판정을 받으세요.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button to="/analyze" variant="ghost">
                서류 다시 올리기
              </Button>
              <Button to="/analyze/result">
                그래도 판정 보기
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </Card>
        ) : (
          <Button to="/analyze/result" size="lg" full>
            내용이 맞습니다, 판정 보기
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>

      <p className="mt-5 text-center text-[12.5px] leading-relaxed text-ink-300">
        AI는 서류를 읽기만 합니다. 위험 여부는 이 값들을 근거로 규칙이 판단합니다.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const color =
    tone === "warn" ? "text-warn-600" : tone === "ok" ? "text-brand-700" : "text-ink-900";
  return (
    <div>
      <p className="text-[12px] text-ink-300">{label}</p>
      <p className={`tnum mt-0.5 text-[15px] font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-1 flex items-center gap-2.5 text-[14px] font-bold">
        <span className="h-4 w-1 rounded-full bg-brand-400" />
        {title}
      </h2>
      {note && <p className="mb-3 pl-3.5 text-[12.5px] leading-relaxed text-ink-500">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function InfoRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone?: "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-[13px] text-ink-500">{label}</dt>
      <dd
        className={`text-right text-[13.5px] font-semibold ${
          value === null ? "text-mute-500" : tone === "warn" ? "text-warn-600" : "text-ink-900"
        }`}
      >
        {value ?? "읽지 못함"}
      </dd>
    </div>
  );
}

function RightCard({
  right: r,
  wrong,
  onToggle,
}: {
  right: ExtractedRight;
  wrong: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      as="li"
      className={`p-4 ${wrong ? "border-warn-300 bg-warn-50/50" : r.isCancelled ? "bg-surface/70" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold tnum ${
            r.isCancelled ? "bg-mute-100 text-mute-500" : "bg-brand-50 text-brand-700"
          }`}
        >
          {r.rankNo}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[14px] font-bold ${
                r.isCancelled ? "text-mute-500 line-through decoration-mute-400" : ""
              }`}
            >
              {r.label}
            </span>
            {r.isCancelled && (
              <span className="rounded-full bg-mute-100 px-2 py-0.5 text-[11px] font-semibold text-mute-600">
                말소됨 — 계산에서 제외
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-500">
            {r.amountKrw !== null && (
              <span className="tnum">
                {r.type === "jeonse_right" ? "전세금" : "채권최고액"}{" "}
                <strong
                  className={`font-semibold ${r.isCancelled ? "text-mute-500" : "text-ink-900"}`}
                >
                  {formatMan(r.amountKrw)}
                </strong>
              </span>
            )}
            {r.holder && <span>{r.holder}</span>}
            {r.registeredOn && <span className="tnum">{r.registeredOn}</span>}
          </div>

          {r.sourceQuote && (
            <p className="mt-2.5 flex gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] leading-relaxed text-ink-700">
              <Quote className="mt-0.5 size-3 shrink-0 text-ink-300" />
              {r.sourceQuote}
            </p>
          )}
        </div>

        <button
          onClick={onToggle}
          className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold transition-colors ${
            wrong
              ? "bg-warn-500 text-white"
              : "border border-line text-ink-300 hover:bg-surface hover:text-ink-700"
          }`}
          aria-pressed={wrong}
        >
          {wrong ? (
            <>
              <Pencil className="size-3" />
              다름
            </>
          ) : (
            <>
              <Check className="size-3" />
              맞음
            </>
          )}
        </button>
      </div>
    </Card>
  );
}
