import { useState } from "react";
import { useNavigate } from "react-router";
import {
  UploadCloud,
  FileCheck2,
  Info,
  ArrowRight,
  X,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button, Card, PageHead, Steps } from "@/components/ui";
import { WhatWeCheck } from "@/components/WhatWeCheck";
import { REGISTRY_CHECK, UPLOAD_NOTICE } from "@/data/document-checks";
import { useFlow } from "@/state/flow";
import { createCase, uploadDocument } from "@/lib/zip042";
import { ApiError } from "@/lib/api";

/** 파일 상한. 백엔드 스키마와 같은 값입니다(base64 로 부풀 것을 감안한 값). */
const MAX_BYTES = 10 * 1024 * 1024;

export default function Analyze() {
  const nav = useNavigate();
  const { setCaseId, reset } = useFlow();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [address, setAddress] = useState("");
  const [depositMan, setDepositMan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deposit = Number(depositMan.replace(/[^\d]/g, ""));
  const ready = file !== null && address.trim().length > 0 && deposit > 0;

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("파일이 10MB를 넘습니다. 인터넷등기소 PDF 원본을 올려주세요.");
      return;
    }
    setFile(f);
  }

  async function start() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 이전 검사 건이 남아 있으면 지웁니다 — 오래된 판정을 새 서류에 붙이면 안 됩니다.
      reset();
      const caseId = await createCase({
        roadAddress: address.trim(),
        depositMan: deposit,
      });
      await uploadDocument(caseId, file, "registry");
      setCaseId(caseId);
      nav("/analyze/documents");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

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
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
            dragging ? "border-brand-400 bg-brand-50" : "border-line bg-surface hover:bg-brand-50/40"
          }`}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
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
        <Card>
          <div className="flex items-center gap-3 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50">
              <FileCheck2 className="size-5 text-brand-600" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{file.name}</p>
              <p className="text-[12.5px] text-ink-300">
                {(file.size / 1024 / 1024).toFixed(1)}MB · 올릴 준비가 되었습니다
              </p>
            </div>
            <button
              onClick={() => setFile(null)}
              className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-surface hover:text-ink-700"
              aria-label="파일 제거"
            >
              <X className="size-4" />
            </button>
          </div>
        </Card>
      )}

      {/* 파일 선택 여부와 무관하게 늘 보여야 합니다 — 무엇을 확인하는지 알아야
          '말소사항 포함'으로 다시 뗄지를 판단할 수 있습니다. */}
      <Card className="mt-3">
        <WhatWeCheck doc={REGISTRY_CHECK} bare />
      </Card>

      {/*
        올리기 직전이 이 문구가 필요한 순간입니다. 하단 고지에도 있지만, 파일을
        건네는 그 자리에서 보이지 않으면 읽히지 않습니다.
      */}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] text-ink-500">
        <ShieldCheck className="size-3.5 shrink-0 text-brand-500" />
        서류는 분석 후 즉시 삭제 처리됩니다.
      </p>

      {/*
        주소와 보증금은 서류에서 읽을 수 없거나(보증금은 등기부에 없습니다),
        읽더라도 사용자 확인이 필요한 값입니다. 이 둘이 없으면 시세 조회도,
        "보증금을 돌려받을 수 있는가" 계산도 할 수 없습니다.
      */}
      <div className="mt-6 grid gap-4 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <label htmlFor="addr" className="mb-2 block text-[13.5px] font-semibold">
            주소
          </label>
          <input
            id="addr"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예) 대전광역시 서구 둔산로 89"
            className="h-12 w-full rounded-xl border border-line bg-white px-4 text-[14.5px] outline-none placeholder:text-ink-300 focus:border-brand-400"
          />
        </div>
        <div>
          <label htmlFor="dep" className="mb-2 block text-[13.5px] font-semibold">
            보증금
          </label>
          <div className="flex h-12 items-center rounded-xl border border-line bg-white px-4 focus-within:border-brand-400">
            <input
              id="dep"
              value={depositMan}
              onChange={(e) => setDepositMan(e.target.value)}
              inputMode="numeric"
              placeholder="15,000"
              className="tnum w-full bg-transparent text-right text-[15px] font-semibold outline-none placeholder:font-normal placeholder:text-ink-300"
            />
            <span className="ml-2 shrink-0 text-[13.5px] text-ink-500">만원</span>
          </div>
        </div>
      </div>

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

      {error && (
        <Card className="mt-6 border-stop-200 bg-stop-50 p-4">
          <p className="text-[13.5px] font-semibold text-stop-700">{error}</p>
        </Card>
      )}

      <div className="mt-8 flex items-center gap-3">
        <Button size="lg" disabled={!ready || busy} className="flex-1" onClick={start}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              올리는 중…
            </>
          ) : (
            <>
              다음
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>

      <div className="mt-5 space-y-1 text-center text-[12.5px] leading-relaxed text-ink-300">
        {UPLOAD_NOTICE.map((t) => (
          <p key={t}>{t}</p>
        ))}
        <p>올리신 서류는 판정에만 사용하며, 개인정보는 화면에 표시되지 않습니다.</p>
      </div>
    </div>
  );
}
