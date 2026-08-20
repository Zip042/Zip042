import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type Term = { term: string; tag?: "위험 신호" | "꼭 챙기기"; desc: string };

const TERMS: Term[] = [
  {
    term: "근저당권",
    tag: "위험 신호",
    desc: "집을 담보로 빌린 돈이 있다는 표시입니다. 채권최고액이 실제 빌린 금액보다 크게 적히며, 경매로 넘어가면 이 금액이 내 보증금보다 먼저 변제됩니다.",
  },
  { term: "확정일자", tag: "꼭 챙기기", desc: "임대차 계약서에 확정일자를 받으면 그 날짜를 기준으로 우선변제권이 생깁니다." },
  { term: "대항력", desc: "전입신고와 인도를 마치면 제3자에게 임차권을 주장할 수 있는 힘이 생깁니다." },
  { term: "신탁등기", tag: "위험 신호", desc: "소유권이 신탁회사에 있는 경우로, 수탁자의 동의 없이 계약하면 무효가 될 수 있습니다." },
  { term: "전세가율", desc: "매매 시세 대비 전세보증금의 비율입니다. 높을수록 보증금을 돌려받기 어려워집니다." },
];

const FRAUD_CASES = [
  "대리인이 위임장을 위조한 경우",
  "한 집에 세입자 두 명을 받은 경우",
  "잔금 후 소유권을 넘긴 경우",
];

export default function Glossary() {
  const [query, setQuery] = useState("");
  const filtered = TERMS.filter((t) => t.term.includes(query) || t.desc.includes(query));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-4 font-display text-xl font-bold">모르는 말은 계약 전에 물어보세요</h1>
      <Input
        placeholder="궁금한 용어 검색 (예: 근저당, 확정일자)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-8"
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_240px]">
        <Accordion type="single" collapsible>
          {filtered.map((t) => (
            <AccordionItem key={t.term} value={t.term}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span className="font-bold">{t.term}</span>
                  {t.tag && (
                    <Badge variant={t.tag === "위험 신호" ? "destructive" : "success"}>{t.tag}</Badge>
                  )}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground">{t.desc}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-brand-primary bg-brand-primary-light p-4">
            <p className="mb-2 text-sm font-bold text-brand-primary">실제 사기 사례</p>
            <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {FRAUD_CASES.map((c) => (
                <li key={c}>· {c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="mb-1 text-sm font-bold">피해를 당했다면</p>
            <p className="text-xs text-muted-foreground">
              전세피해지원센터 · 임차권등기명령 · 보증이행 청구 절차 안내
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
