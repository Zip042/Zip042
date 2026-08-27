import { useState } from "react";
import { UploadCloud, FileCheck2, Info, ArrowRight, X, ExternalLink } from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";

export default function Analyze() {
  const [file, setFile] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-5 py-12 sm:py-16">
      <Steps current={1} />
      <PageHead
        title="등기부등본을 올려주세요"
        lead="인터넷등기소에서 받은 PDF를 그대로 올리시면 됩니다. 사진으로 찍은 것도 읽을 수 있습니다."
      />

      {!file ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            setFile(e.dataTransfer.files?.[0]?.name ?? "등기부등본.pdf");
          }}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:bg-brand-50/40"
          }`}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
          />
          <span className="grid size-12 place-items-center rounded-2xl bg-white ring-1 ring-line">
            <UploadCloud className="size-5.5 text-brand-600" strokeWidth={1.8} />
          </span>
          <span className="mt-4 text-[15px] font-semibold">
            파일을 끌어다 놓거나 눌러서 선택하세요
          </span>
          <span className="mt-1.5 text-[13px] text-ink-300">PDF · JPG · PNG · 최대 10MB</span>
        </label>
      ) : (
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50">
            <FileCheck2 className="size-5 text-brand-600" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">{file}</p>
            <p className="text-[12.5px] text-ink-300">올릴 준비가 되었습니다</p>
          </div>
          <button
            onClick={() => setFile(null)}
            className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-surface hover:text-ink-700"
            aria-label="파일 제거"
          >
            <X className="size-4" />
          </button>
        </Card>
      )}

      <div className="mt-6 rounded-xl bg-surface px-5 py-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-300" />
          <div className="text-[13px] leading-relaxed text-ink-500">
            <p className="font-semibold text-ink-700">말소사항 포함으로 발급받으세요</p>
            <p className="mt-1">
              말소된 근저당까지 보여야 정확하게 판단할 수 있습니다. 인터넷등기소에서
              &lsquo;말소사항 포함&rsquo;을 선택하면 됩니다.
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Info className="size-4 shrink-0 text-brand-500" />
          <a
            href="https://www.iros.go.kr/index.jsp"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-500 hover:underline"
          >
            등기부등본 발급 바로가기
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button to="/analyze/documents" size="lg" disabled={!file} className="flex-1">
          다음
          <ArrowRight className="size-4" />
        </Button>
      </div>

      <p className="mt-5 text-center text-[12.5px] leading-relaxed text-ink-300">
        올리신 서류는 판정에만 사용하며, 개인정보는 화면에 표시되지 않습니다.
      </p>
    </div>
  );
}
