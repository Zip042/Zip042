import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type Term = { term: string; tag?: "위험 신호" | "꼭 챙기기"; desc: string };

const TERMS: Term[] = [
  {
    term: "근저당권",
    tag: "위험 신호",
    desc: "집을 담보로 빌린 돈이 있다는 표시입니다. 등기부에는 실제 빌린 금액보다 큰 채권최고액이 적히고, 집이 경매로 넘어가면 이 금액이 내 보증금보다 먼저 변제됩니다.",
  },
  { term: "확정일자", tag: "꼭 챙기기", desc: "임대차 계약서에 확정일자를 받으면 그 날짜를 기준으로 우선변제권이 생깁니다." },
  { term: "대항력", desc: "전입신고와 인도를 마치면 제3자에게 임차권을 주장할 수 있는 힘이 생깁니다." },
  { term: "신탁등기", tag: "위험 신호", desc: "소유권이 신탁회사에 있는 경우로, 수탁자의 동의 없이 계약하면 무효가 될 수 있습니다." },
  { term: "전세가율", desc: "매매 시세 대비 전세보증금의 비율입니다. 높을수록 보증금을 돌려받기 어려워집니다." },
];

const FILTERS = ["전체", "등기부", "보증금", "계약서"];

const FRAUD_CASES = [
  "대리인이 위임장을 위조한 경우",
  "한 집에 세입자 두 명을 받은 경우",
  "잔금 직후 소유권을 넘긴 경우",
];

export default function Glossary() {
  const [query, setQuery] = useState("");
  const filtered = TERMS.filter((t) => t.term.includes(query) || t.desc.includes(query));

  return (
    <div>
      <div className="mx-auto max-w-6xl px-8 py-14">
        <h1 className="font-display text-[30px] font-black tracking-tight">모르는 말은 계약 전에 물어보세요</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          등기부와 계약서에 나오는 용어를 사회초년생 기준으로 풀어 씁니다.
        </p>

        <div className="mt-5.5 flex flex-wrap items-center gap-3">
          <Input
            placeholder="궁금한 용어 검색 (예: 근저당, 확정일자)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-[520px] rounded-xl border-border-strong py-3"
          />
          <div className="flex flex-wrap gap-2 text-sm">
            {FILTERS.map((f, i) => (
              <span
                key={f}
                className={
                  i === 0
                    ? "rounded-full bg-foreground px-4 py-2 font-bold text-white"
                    : "rounded-full border border-border px-4 py-2 text-muted-foreground"
                }
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6.5 grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
          <Accordion type="single" collapsible>
            {filtered.map((t) => (
              <AccordionItem key={t.term} value={t.term} className="rounded-2xl border border-border px-1.5 mb-2.5">
                <AccordionTrigger className="px-4">
                  <span className="flex items-center gap-2.5">
                    <span className="text-lg font-bold">{t.term}</span>
                    {t.tag === "위험 신호" && <Badge variant="danger-outline">위험 신호</Badge>}
                    {t.tag === "꼭 챙기기" && (
                      <span className="text-[13px] font-bold text-brand-primary">꼭 챙기기</span>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4">
                  <p className="max-w-xl text-sm leading-[1.8] text-muted-foreground">{t.desc}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="flex flex-col gap-3.5">
            <div className="rounded-2xl border border-danger-border bg-white p-5">
              <p className="text-sm font-bold text-danger">실제 사기 사례</p>
              <div className="mt-2.5 flex flex-col gap-2.5 text-[13px] text-danger-text">
                {FRAUD_CASES.map((c) => (
                  <p key={c}>{c}</p>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-white p-5">
              <p className="text-sm font-bold">피해를 당했다면</p>
              <p className="mt-2.5 text-[13px] leading-[1.8] text-muted-foreground">
                전세피해지원센터 안내 · 임차권등기명령 절차 · 보증이행 청구 방법을 순서대로 정리했습니다.
              </p>
              <p className="mt-3 text-[13px] font-bold text-brand-primary">대응 절차 보기</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
