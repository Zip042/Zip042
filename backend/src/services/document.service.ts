import { loadEnv } from "../env.js";
import { badRequest, notFound, upstreamFailed } from "../lib/errors.js";
import { log } from "../lib/logger.js";
import { adminClient, unwrap, type Db } from "../lib/supabase.js";
import type {
  BrokerageStatementExtraction,
  LeaseDraftExtraction,
  RegistryExtraction,
} from "../domain/types.js";
import {
  EXTRACTION_SCHEMA_VERSION,
  extractBrokerageStatement,
  extractLeaseDraft,
  extractRegistry,
  isExtractionAvailable,
} from "./extraction.service.js";

export type DocType = "registry" | "brokerage_statement" | "lease_draft" | "building_ledger" | "other";

export interface DocumentRow {
  id: string;
  case_id: string;
  doc_type: DocType;
  storage_path: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  status: "uploaded" | "processing" | "parsed" | "failed";
  error_message: string | null;
  uploaded_at: string;
  parsed_at: string | null;
}

const DOC_COLUMNS =
  "id,case_id,doc_type,storage_path,original_name,mime_type,size_bytes,status,error_message,uploaded_at,parsed_at";

/** 업로드 경로 규칙: {user_id}/{case_id}/{uuid}.{ext} — Storage RLS 정책이 첫 세그먼트를 검사한다. */
export function buildStoragePath(userId: string, caseId: string, fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${userId}/${caseId}/${crypto.randomUUID()}.${ext || "bin"}`;
}

/**
 * 클라이언트가 파일을 직접 Storage로 올릴 수 있게 서명 URL을 발급한다.
 * 20MB 파일을 API 서버로 통과시키지 않는 편이 비용·지연 면에서 낫다.
 */
export async function createSignedUpload(
  userId: string,
  caseId: string,
  fileName: string,
): Promise<{ path: string; token: string; url: string }> {
  const env = loadEnv();
  const path = buildStoragePath(userId, caseId, fileName);
  const { data, error } = await adminClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) {
    throw upstreamFailed(`업로드 URL 발급 실패: ${error?.message ?? "unknown"}`);
  }
  return { path: data.path, token: data.token, url: data.signedUrl };
}

export async function registerDocument(
  db: Db,
  caseId: string,
  input: {
    docType: DocType;
    storagePath: string;
    originalName?: string | null;
    mimeType: string;
    sizeBytes: number;
  },
): Promise<DocumentRow> {
  // 같은 종류의 문서를 다시 올리면 이전 것을 대체한다 (최신 1건만 분석에 쓴다).
  const result = await adminClient()
    .from("documents")
    .insert({
      case_id: caseId,
      doc_type: input.docType,
      storage_path: input.storagePath,
      original_name: input.originalName ?? null,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      status: "uploaded",
    })
    .select(DOC_COLUMNS)
    .single();
  void db; // 소유권 검증은 라우트에서 사용자 클라이언트로 이미 수행한다.
  return unwrap(result, "문서 등록") as unknown as DocumentRow;
}

export async function listDocuments(db: Db, caseId: string): Promise<DocumentRow[]> {
  const { data, error } = await db
    .from("documents")
    .select(DOC_COLUMNS)
    .eq("case_id", caseId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`문서 목록 조회: ${error.message}`);
  return (data ?? []) as unknown as DocumentRow[];
}

export async function deleteDocument(caseId: string, documentId: string): Promise<void> {
  const env = loadEnv();
  const admin = adminClient();
  const { data, error } = await admin
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`문서 조회: ${error.message}`);
  if (!data) throw notFound("문서를 찾을 수 없습니다.");

  await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([data.storage_path as string]);
  const { error: delErr } = await admin.from("documents").delete().eq("id", documentId);
  if (delErr) throw new Error(`문서 삭제: ${delErr.message}`);
}

async function downloadDocument(storagePath: string): Promise<Buffer> {
  const env = loadEnv();
  const { data, error } = await adminClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .download(storagePath);
  if (error || !data) {
    throw upstreamFailed(`문서를 내려받지 못했습니다: ${error?.message ?? "unknown"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

export interface CaseExtractions {
  registry: RegistryExtraction | null;
  brokerage: BrokerageStatementExtraction | null;
  lease: LeaseDraftExtraction | null;
  /** 파싱에 실패한 문서 (사용자에게 알려야 한다) */
  failures: { docType: DocType; message: string }[];
  /** 문서별 판독 신뢰도 */
  confidences: Partial<Record<DocType, number>>;
}

/**
 * case에 등록된 문서들을 파싱한다.
 *
 * 이미 파싱된 문서는 저장된 payload 를 재사용한다(reparse=false). AI 호출은 비싸고,
 * 같은 문서에서 다른 결과가 나오면 판정이 흔들리기 때문이다.
 */
export async function ensureExtractions(
  caseId: string,
  opts: { reparse: boolean } = { reparse: false },
): Promise<CaseExtractions> {
  const admin = adminClient();
  const out: CaseExtractions = {
    registry: null,
    brokerage: null,
    lease: null,
    failures: [],
    confidences: {},
  };

  const { data: docs, error } = await admin
    .from("documents")
    .select(DOC_COLUMNS)
    .eq("case_id", caseId)
    .order("uploaded_at", { ascending: false });
  if (error) throw new Error(`문서 조회: ${error.message}`);

  // 같은 종류가 여러 건이면 가장 최근 것만 쓴다.
  const latest = new Map<DocType, DocumentRow>();
  for (const doc of (docs ?? []) as unknown as DocumentRow[]) {
    if (!latest.has(doc.doc_type)) latest.set(doc.doc_type, doc);
  }

  for (const [docType, doc] of latest) {
    if (docType === "building_ledger" || docType === "other") continue;

    if (!opts.reparse) {
      const { data: cached } = await admin
        .from("document_extractions")
        .select("payload,confidence,schema_version")
        .eq("document_id", doc.id)
        .maybeSingle();
      if (cached && cached.schema_version === EXTRACTION_SCHEMA_VERSION) {
        assign(out, docType, cached.payload, Number(cached.confidence ?? 0.5));
        continue;
      }
    }

    if (!isExtractionAvailable()) {
      out.failures.push({
        docType,
        message: "문서 분석 기능이 설정되지 않았습니다. (ANTHROPIC_API_KEY 미설정)",
      });
      continue;
    }

    try {
      await admin.from("documents").update({ status: "processing" }).eq("id", doc.id);
      const buffer = await downloadDocument(doc.storage_path);

      const ctx = { documentId: doc.id, originalName: doc.original_name };
      const result =
        docType === "registry"
          ? await extractRegistry(buffer, doc.mime_type, ctx)
          : docType === "brokerage_statement"
            ? await extractBrokerageStatement(buffer, doc.mime_type, ctx)
            : await extractLeaseDraft(buffer, doc.mime_type, ctx);

      await admin.from("document_extractions").upsert(
        {
          document_id: doc.id,
          case_id: caseId,
          doc_type: docType,
          model: result.model,
          schema_version: result.schemaVersion,
          payload: result.payload,
          confidence: result.confidence,
          warnings: (result.payload as { unreadableSections?: string[] }).unreadableSections ?? [],
          usage: result.usage,
        },
        { onConflict: "document_id" },
      );
      await admin
        .from("documents")
        .update({ status: "parsed", parsed_at: new Date().toISOString(), error_message: null })
        .eq("id", doc.id);

      assign(out, docType, result.payload, result.confidence);

      if (docType === "registry") {
        await persistRegistryRights(caseId, doc.id, result.payload as RegistryExtraction);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("문서 파싱 실패", { caseId, docType, message });
      await admin
        .from("documents")
        .update({ status: "failed", error_message: message.slice(0, 500) })
        .eq("id", doc.id);
      out.failures.push({ docType, message });
    }
  }

  return out;
}

function assign(out: CaseExtractions, docType: DocType, payload: unknown, confidence: number): void {
  out.confidences[docType] = confidence;
  if (docType === "registry") out.registry = payload as RegistryExtraction;
  else if (docType === "brokerage_statement") out.brokerage = payload as BrokerageStatementExtraction;
  else if (docType === "lease_draft") out.lease = payload as LeaseDraftExtraction;
}

/** 등기부 권리 목록을 정규화 테이블에 저장한다. 재분석·감사 추적에 쓴다. */
async function persistRegistryRights(
  caseId: string,
  documentId: string,
  registry: RegistryExtraction,
): Promise<void> {
  const admin = adminClient();
  await admin.from("registry_rights").delete().eq("document_id", documentId);
  if (registry.rights.length === 0) return;

  const { error } = await admin.from("registry_rights").insert(
    registry.rights.map((r) => ({
      case_id: caseId,
      document_id: documentId,
      section: r.section,
      rank_no: r.rankNo,
      right_type: r.type,
      holder: r.holder,
      max_claim_krw: r.maxClaimKrw,
      registered_on: r.registeredOn,
      is_cancelled: r.isCancelled,
      note: r.note,
    })),
  );
  if (error) log.warn("권리 목록 저장 실패", { documentId, error: error.message });
}

/** 문서 열람용 서명 URL. 만료 시간을 짧게 둔다. */
export async function createSignedDownload(
  caseId: string,
  documentId: string,
  expiresInSeconds = 300,
): Promise<string> {
  const env = loadEnv();
  const admin = adminClient();
  const { data, error } = await admin
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) throw new Error(`문서 조회: ${error.message}`);
  if (!data) throw notFound("문서를 찾을 수 없습니다.");

  const signed = await admin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(data.storage_path as string, expiresInSeconds);
  if (signed.error || !signed.data) {
    throw upstreamFailed(`열람 URL 발급 실패: ${signed.error?.message ?? "unknown"}`);
  }
  return signed.data.signedUrl;
}

/** storagePath 가 실제로 이 사용자·case 소유 경로인지 검증한다. */
export function assertStoragePathOwnership(path: string, userId: string, caseId: string): void {
  const segments = path.split("/");
  if (segments[0] !== userId || segments[1] !== caseId) {
    throw badRequest("업로드 경로가 올바르지 않습니다.");
  }
}
