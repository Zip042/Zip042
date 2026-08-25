import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import Stepper from "@/components/Stepper";
import { createCase, createUploadUrl, getCase, registerDocument, uploadToSignedUrl } from "@/lib/api";
import { runAnalysis } from "@/lib/runAnalysis";
import { toMessage } from "@/lib/useAsync";
import { useAnalysisFlow } from "@/state/AnalysisFlow";

/**
 * 등기부등본 업로드 → 판독 → 분석.
 *
 * 흐름은 백엔드의 2단계 업로드를 그대로 따릅니다.
 *   1. 검사 건 생성 (아직 계약 조건이 없으므로 최소값으로)
 *   2. 서명 업로드 URL 발급 → 파일을 Storage 로 **직접** PUT
 *   3. 문서 등록 → 분석 작업 등록 → 진행률 폴링
 *
 * 파일이 API 서버를 통과하지 않으므로 큰 파일도 서버 메모리를 쓰지 않습니다.
 */

const CHECK_ITEMS = [
  "소유자 정보와 변동 이력",
  "근저당권 · 채권최고액",
  "가압류 · 경매 · 신탁등기",
  "전세가율 (실거래 시세 대조)",
  "임차권등기명령 이력",
];

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// 서버 한도와 같은 값이어야 한다. 더 크게 두면 화면은 통과시키고 서버가 거절해
// 사용자는 이유를 알 수 없다. (base64 로 1.33배 부풀기 때문에 10MB 다.)
const MAX_BYTES = 10 * 1024 * 1024;

type Phase = "idle" | "uploading" | "analyzing" | "done";

export default function Analyze() {
  const navigate = useNavigate();
  const flow = useAnalysisFlow();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(flow.registryFileName);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("PDF 또는 이미지(JPG · PNG · WebP) 파일만 올릴 수 있습니다.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("파일이 너무 큽니다. 10MB 이하로 올려주세요.");
      return;
    }

    setFileName(file.name);
    setPhase("uploading");
    setProgress(5);
    setStep("검사 건을 만들고 있어요");

    try {
      // 1) 검사 건. 계약 조건은 아직 모르므로 나중에 /analyze/details 에서 채운다.
      //
      // 들고 있던 caseId 가 서버에 없을 수 있다 — 목 모드 백엔드를 재시작하면 인메모리
      // 저장소가 비고, live 에서도 사용자가 다른 기기에서 검사 건을 지웠을 수 있다.
      // 그때 404 로 막다른 길에 놓는 대신 새 검사 건을 만들어 이어간다.
      let caseId = flow.caseId;
      if (caseId) {
        try {
          await getCase(caseId);
        } catch {
          caseId = null;
          flow.reset();
        }
      }
      if (!caseId) {
        const created = await createCase({
          title: file.name.replace(/\.[^.]+$/, ""),
          leaseType: "jeonse",
          amountUnit: "man",
        });
        caseId = (created as unknown as { case: { id: string } }).case.id;
        flow.update({ caseId });
      }

      // 2) 서명 URL 발급 → Storage 로 직접 업로드
      setProgress(20);
      setStep("파일을 올리는 중이에요");
      const signed = await createUploadUrl(caseId, {
        fileName: file.name,
        docType: "registry",
        mimeType: file.type,
      });
      const upload = (signed as unknown as { upload: { url: string; storagePath: string } }).upload;
      await uploadToSignedUrl(upload.url, file);

      // 3) 문서 등록
      setProgress(35);
      setStep("문서를 등록하는 중이에요");
      await registerDocument(caseId, {
        docType: "registry",
        storagePath: upload.storagePath,
        mimeType: file.type,
        sizeBytes: file.size,
        originalName: file.name,
      });

      flow.update({ registryFileName: file.name });

      // 4) 분석 실행. 서버리스에서는 비동기 작업이 실행되지 않으므로 runAnalysis 가
      //    `/v1/meta` 의 capabilities 를 보고 동기·비동기 경로를 알아서 고른다.
      setPhase("analyzing");
      const analysis = await runAnalysis(caseId, {
        onProgress: ({ progress, step }) => {
          setProgress(Math.max(35, progress));
          setStep(step);
        },
      });
      if (analysis) flow.update({ lastAnalysis: analysis });
      setPhase("done");
      setProgress(100);
      setStep("완료");
    } catch (err) {
      setError(toMessage(err));
      setPhase("idle");
      setProgress(0);
      setStep(null);
    }
  }

  const busy = phase === "uploading" || phase === "analyzing";

  return (
    <div className="border-b border-border bg-background-alt">
      <div className="mx-auto max-w-6xl px-8 py-11">
        <Stepper current={0} />

        <div className="mt-7 grid grid-cols-1 items-start gap-8 md:grid-cols-[1fr_320px]">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight">등기부등본을 올려주세요</h1>
            <p className="mt-2 text-sm text-muted-foreground-light">
              인터넷등기소에서 발급한 열람본이면 됩니다. PDF · 10MB 이하.
            </p>
            {/*
              말소된 권리를 애초에 안 받는 것이 가장 확실한 방어다. 서버도 말소 등기를
              코드로 걸러내지만, 취소선은 글자가 아니라 판독이 놓칠 수 있다.
            */}
            <p className="mt-1 text-sm text-brand-primary">
              발급할 때 <strong className="font-bold">"현재 유효사항만"</strong> 을 선택하면 판독이 더
              정확합니다. 말소사항이 포함돼 있어도 걸러내지만, 처음부터 없는 편이 낫습니다.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file && !busy) void handleFile(file);
              }}
              className={
                dragging
                  ? "mt-5 rounded-2xl border-2 border-dashed border-brand-primary bg-brand-primary-light px-8 py-12 text-center"
                  : "mt-5 rounded-2xl border-2 border-dashed border-brand-primary/45 bg-white px-8 py-12 text-center"
              }
            >
              <p className="font-display text-lg font-extrabold">여기로 파일을 끌어다 놓으세요</p>
              <p className="mt-1.5 text-sm text-muted-foreground-light">또는</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(",")}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="mt-3.5 rounded-[11px] bg-brand-primary hover:bg-brand-primary-hover"
              >
                파일 선택
              </Button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-danger-border bg-white px-5 py-4">
                <p className="text-sm font-bold text-danger">문제가 생겼습니다</p>
                <p className="mt-1 text-sm text-danger-text">{error}</p>
              </div>
            )}

            {fileName && !error && (
              <div className="mt-4 rounded-2xl border border-border bg-white px-5 py-4.5">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-bold">{fileName}</p>
                  <p className="text-sm font-bold text-brand-primary">
                    {phase === "done" ? "분석 완료" : `분석 중 ${progress}%`}
                  </p>
                </div>
                <Progress value={progress} className="mt-3 bg-border" />
                <p className="mt-2 text-xs text-muted-foreground-light">
                  {step ?? "잠시만 기다려 주세요"}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white p-5.5">
            <p className="text-sm font-bold">무엇을 확인하나요</p>
            <div className="mt-3.5 flex flex-col gap-2 text-sm text-muted-foreground">
              {CHECK_ITEMS.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <p className="mt-4.5 border-t border-border pt-3.5 text-xs leading-relaxed text-muted-foreground-light">
              업로드한 파일은 분석이 끝나면 즉시 삭제됩니다. 분석 결과는 참고용이며 법적 효력이 없습니다.
            </p>
            <Button
              disabled={phase !== "done"}
              onClick={() => navigate("/analyze/documents")}
              className="mt-4.5 w-full rounded-[11px] bg-brand-primary hover:bg-brand-primary-hover"
            >
              {phase === "done" ? "다음으로" : "분석이 끝나면 진행할 수 있어요"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
