import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Card, PageHead } from "@/components/ui";
import { Failed, Loading } from "@/components/AsyncState";
import { getGlossary, type GlossaryTerm } from "@/lib/zip042";

export default function Glossary() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getGlossary()
      .then((t) => {
        if (!alive) return;
        setTerms(t);
        setOpen(t[0]?.code ?? null);
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <Failed message={error} />;
  if (!terms) return <Loading label="용어사전을 불러오는 중…" />;

  const list = terms.filter(
    (t) => t.term.includes(q) || t.summary.includes(q) || t.description.includes(q),
  );

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <PageHead
        title="용어사전"
        lead="계약서와 등기부에 나오는 말들을 쉬운 말로 풀었습니다."
      />

      <div className="mb-6 flex h-12 items-center gap-2.5 rounded-xl border border-line bg-white px-4 focus-within:border-brand-400">
        <Search className="size-4 shrink-0 text-ink-300" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="궁금한 단어를 찾아보세요"
          className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-ink-300"
        />
      </div>

      {list.length === 0 ? (
        <p className="py-12 text-center text-[14px] text-ink-300">
          &lsquo;{q}&rsquo;에 해당하는 용어가 없습니다.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {list.map((t) => {
            const isOpen = open === t.code;
            return (
              <Card as="li" key={t.code} className="overflow-hidden">
                <button
                  onClick={() => setOpen(isOpen ? null : t.code)}
                  className="flex w-full items-center gap-3 p-5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold">{t.term}</span>
                    <span className="mt-1 block text-[13px] text-ink-500">{t.summary}</span>
                  </span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-ink-300 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <p className="border-t border-line bg-surface/60 px-5 py-4 text-[13.5px] leading-relaxed text-ink-700">
                    {t.description}
                  </p>
                )}
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
