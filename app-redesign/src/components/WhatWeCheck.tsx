import { ChevronDown, ExternalLink, Search } from "lucide-react";
import type { DocumentCheck } from "@/data/document-checks";

/**
 * "무엇을 조회하나요?" — 서류마다 접었다 펴는 설명.
 *
 * ## 왜 접어두는가
 *
 * 다섯 장 전부의 확인 항목을 펼쳐두면 30줄이 넘습니다. 그러면 정작 해야 할 일
 * (파일 올리기)이 묻힙니다. 반대로 아예 안 보여주면 "이걸 왜 떼야 하지"를 몰라
 * 그냥 건너뜁니다. 그래서 **궁금한 사람만 눌러서** 보게 합니다.
 *
 * `<details>` 를 쓴 것은 의도입니다 — 상태 없이 동작하고, 스크린리더가 펼침/접힘을
 * 읽어주며, JS 가 실패해도 열립니다.
 */
export function WhatWeCheck({ doc, bare }: { doc: DocumentCheck; bare?: boolean }) {
  return (
    // `bare` 는 카드 안에 단독으로 놓일 때입니다 — 위에 아무것도 없으므로
    // 구분선을 그리면 허공에 줄이 하나 뜹니다.
    <details className={`group ${bare ? "" : "border-t border-line"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-semibold text-ink-500 transition-colors hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        <Search className="size-3.5 shrink-0 text-ink-300" strokeWidth={2.2} />
        무엇을 조회하나요?
        <ChevronDown className="ml-auto size-4 shrink-0 text-ink-300 transition-transform group-open:rotate-180" />
      </summary>

      <div className="px-4 pb-4 pt-1">
        <ul className="space-y-1.5">
          {doc.checks.map((c) => (
            <li key={c} className="flex gap-2 text-[13px] leading-relaxed text-ink-700">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-brand-400" />
              {c}
            </li>
          ))}
        </ul>

        {/* 확인 항목이 '무엇을'이라면, 이건 '왜'입니다. 둘 다 있어야 서류를 떼러 갑니다. */}
        <div className="mt-3 rounded-xl bg-surface px-3.5 py-3">
          <p className="text-[12px] font-semibold text-ink-700">이 서류가 잡아내는 것</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{doc.catches}</p>
        </div>

        {doc.constraint && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-warn-600">{doc.constraint}</p>
        )}

        {doc.link && (
          <a
            href={doc.link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-600 hover:underline"
          >
            {doc.link.label}에서 발급
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </details>
  );
}
