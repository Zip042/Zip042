import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";
import { createUploadUrl, listDocuments, registerDocument, uploadToSignedUrl } from "@/lib/api";
import { runAnalysis } from "@/lib/runAnalysis";
import { toMessage, useAsync } from "@/lib/useAsync";
import { useAnalysisFlow } from "@/state/AnalysisFlow";

/**
 * 추가 서류 업로드 (중개대상물 확인·설명서 · 임대차 계약서 초안).
 *
 * 필수가 아닙니다. 다만 올리지 않으면 계약서에서만 확인할 수 있는 항목(이중계약 · 특약 누락)이
 * 판정에서 빠지므로, 백엔드가 그걸 `info_gap` 으로 올려 "아직 판단할 수 없어요"로 표시합니다.
 */

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// 서버 한도와 같은 값이어야 한다. 더 크게 두면 화면은 통과시키고 서버가 거절해
// 사용자는 이유를 알 수 없다. (base64 로 1.33배 부풀기 때문에 10MB 다.)
const MAX_BYTES = 10 * 1024 * 1024;

interface DocumentRow {
  docType: string;
  originalName: string | null;
  status: string;
}

const SLOTS = [
  {
    docType: "brokerage_statement",
    title: "중개대상물 확인·설명서",
    description:
      "중개사가 설명한 내용과 등기부가 일치하는지 대조합니다. 설명서에 빠진 항목도 짚어드립니다.",
  },
  {
    docType: "lease_draft",
    title: "임대차 계약서 초안",
    description:
      "보증금·계약 당사자·특약사항을 확인해, 넣어야 할 특약이 빠졌는지 알려드립니다.",
  },
] as const;

export default function AnalyzeDocuments() {
  const navigate = useNavigate();
  const flow = useAnalysisFlow();
  const caseId = flow.caseId;

  const docs = useAsync<{ documents: DocumentRow[] }>(
    async () =>
      caseId
        ? ((await listDocuments(caseId)) as unknown as { documents: DocumentRow[] })
        : { documents: [] },
    [caseId],
  );

  const [busyType, setBusyType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  const uploaded = new Map((docs.data?.documents ?? []).map((d) => [d.docType, d]));

  async function upload(docType: string, file: File) {
    if (!caseId) return;
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("PDF 또는 이미지(JPG · PNG · WebP) 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("파일이 너무 큽니다. 10MB 이하로 올려주세요.");
      return;
    }

    setBusyType(docType);
    try {
      const signed = await createUploadUrl(caseId, {
        fileName: file.name,
        docType,
        mimeType: file.type,
      });
      const upload = (signed as unknown as { upload: { url: string; storagePath: string } }).upload;
      await uploadToSignedUrl(upload.url, file);
      await registerDocument(caseId, {
        docType,
        storagePath: upload.storagePath,
        mimeType: file.type,
        sizeBytes: file.size,
        originalName: file.name,
      });
      docs.reload();
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusyType(null);
    }
  }

  /** 올린 서류를 포함해 다시 분석한 뒤 결과로 넘어간다. */
  async function reanalyzeAndGo() {
    if (!caseId) return;
    setError(null);
    setReanalyzing(true);
    try {
      const analysis = await runAnalysis(caseId, { reparseDocuments: true });
      flow.update({ skippedDocuments: false, ...(analysis ? { lastAnalysis: analysis } : {}) });
      navigate("/analyze/result");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setReanalyzing(false);
    }
  }

  if (!caseId) {
    return (
      <div className="border-b border-border">
        <div className="mx-auto max-w-6xl px-8 py-11">
          <Stepper current={1} />
          <h1 className="mt-8 font-display text-2xl font-black tracking-tight">
            먼저 등기부등본을 올려주세요
          </h1>
          <p className="mt-2 text-sm text-muted-foreground-light">
            추가 서류는 등기부 분석이 끝난 뒤에 올릴 수 있습니다.
          </p>
          <Button
            className="mt-5 rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover"
            onClick={() => navigate("/analyze")}
          >
            등기부등본 올리러 가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={1} />

        <div className="mt-6 flex items-center gap-3 rounded-xl border border-brand-primary-border px-4.5 py-3.5">
          <Badge>완료</Badge>
          <p className="text-sm text-brand-primary-hover">
            등기부등본 분석이 끝났습니다. 서류를 더 올리면 확인할 수 있는 항목이 늘어납니다.
          </p>
        </div>

        <h1 className="mt-8 font-display text-2xl font-black tracking-tight">추가로 올리면 좋은 서류</h1>
        <p className="mt-2 text-sm text-muted-foreground-light">
          필수가 아닙니다. 서류가 없으면 주소로 조회해 대신할 수 있습니다.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
          {SLOTS.map((slot) => (
            <DocumentSlot
              key={slot.docType}
              docType={slot.docType}
              title={slot.title}
              description={slot.description}
              uploadedName={uploaded.get(slot.docType)?.originalName ?? null}
              busy={busyType === slot.docType}
              onPick={(file) => void upload(slot.docType, file)}
            />
          ))}
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-danger-border bg-white px-4.5 py-4">
            <p className="text-sm font-bold text-danger">문제가 생겼습니다</p>
            <p className="mt-1 text-sm text-danger-text">{error}</p>
          </div>
        )}

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-danger-border bg-white px-4.5 py-4">
          <Badge className="bg-danger">주의</Badge>
          <p className="text-sm leading-relaxed text-danger-text">
            서류를 올리지 않으면 이중계약·특약 누락처럼 계약서에서만 확인할 수 있는 항목은 판정에서 빠집니다.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-3.5 border-t border-border pt-5.5">
          <Button
            disabled={reanalyzing || uploaded.size === 0}
            onClick={() => void reanalyzeAndGo()}
            className="rounded-xl bg-brand-primary px-6 hover:bg-brand-primary-hover"
          >
            {reanalyzing ? "다시 분석하는 중…" : "서류 포함해서 분석하기"}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-border-strong"
            onClick={() => {
              flow.update({ skippedDocuments: true });
              navigate("/analyze/details");
            }}
          >
            건너뛰고 결과 보기
          </Button>
          <p className="text-sm text-muted-foreground-light">나중에 결과 화면에서도 추가할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
}

function DocumentSlot({
  title,
  description,
  uploadedName,
  busy,
  onPick,
}: {
  docType: string;
  title: string;
  description: string;
  uploadedName: string | null;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-border p-6">
      <div className="flex items-center gap-2">
        <p className="text-base font-bold">{title}</p>
        <Badge variant="brand-outline">권장</Badge>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />

      {uploadedName ? (
        <div className="mt-4.5 flex items-center justify-between rounded-xl border border-brand-primary-border bg-white px-4.5 py-4">
          <p className="text-sm">{uploadedName}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-sm font-bold text-brand-primary"
          >
            {busy ? "올리는 중…" : "업로드 완료"}
          </button>
        </div>
      ) : (
        <div className="mt-4.5 rounded-xl border-2 border-dashed border-border-strong bg-background-alt px-6 py-6 text-center">
          <p className="text-sm text-muted-foreground-light">PDF 또는 사진으로 올려주세요</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-2.5 rounded-[10px] bg-white"
          >
            {busy ? "올리는 중…" : "파일 선택"}
          </Button>
        </div>
      )}
    </div>
  );
}
