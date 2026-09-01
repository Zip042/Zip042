import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppBindings } from "../middleware/auth.js";
import { registerDocumentSchema, uploadUrlSchema } from "../schemas/case.js";
import {
  assertStoragePathOwnership,
  createSignedDownload,
  createSignedUpload,
  deleteDocument,
  listDocuments,
  registerDocument,
} from "../services/document.service.js";
import { isMockMode } from "../env.js";
import { applyMockScenario } from "../mock/apply-scenario.js";
import { assertOwnership } from "./cases.js";

const caseParam = z.object({ caseId: z.string().uuid() });
const docParam = z.object({ caseId: z.string().uuid(), documentId: z.string().uuid() });

export const documentsRoute = new Hono<AppBindings>();

/**
 * 업로드 흐름 (2단계)
 *   1. POST /upload-url  → 서명된 업로드 URL과 storagePath 를 받는다.
 *   2. 클라이언트가 Storage 로 파일을 직접 PUT.
 *   3. POST /            → storagePath 를 서버에 등록한다.
 *
 * 20MB 문서를 API 서버로 통과시키지 않아 지연·메모리 부담이 없다.
 */
documentsRoute.post(
  "/:caseId/documents/upload-url",
  zValidator("param", caseParam),
  zValidator("json", uploadUrlSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const { fileName, docType, mimeType } = c.req.valid("json");
    const user = c.get("user");
    await assertOwnership(c.get("accessToken"), caseId);

    const signed = await createSignedUpload(user.id, caseId, fileName);
    return c.json({
      upload: {
        url: signed.url,
        token: signed.token,
        storagePath: signed.path,
        method: "PUT",
        headers: { "content-type": mimeType },
      },
      next: {
        description: "업로드 후 아래 요청으로 문서를 등록하세요.",
        endpoint: `POST /v1/cases/${caseId}/documents`,
        body: { docType, storagePath: signed.path, mimeType, sizeBytes: "<파일 크기>" },
      },
    });
  },
);

documentsRoute.post(
  "/:caseId/documents",
  zValidator("param", caseParam),
  zValidator("json", registerDocumentSchema),
  async (c) => {
    const { caseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const user = c.get("user");
    const db = await assertOwnership(c.get("accessToken"), caseId);

    // 클라이언트가 남의 경로를 등록하지 못하게 막는다.
    assertStoragePathOwnership(body.storagePath, user.id, caseId);

    const doc = await registerDocument(db, caseId, {
      docType: body.docType,
      storagePath: body.storagePath,
      originalName: body.originalName ?? null,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });

    // 목 모드에서만: 이 문서를 어떤 시나리오로 판독할지 기록한다.
    const appliedScenario = isMockMode()
      ? applyMockScenario(doc.id, body.mockScenario, body.originalName)
      : null;

    return c.json(
      {
        appliedMockScenario: appliedScenario,
        document: {
          id: doc.id,
          docType: doc.doc_type,
          status: doc.status,
          originalName: doc.original_name,
          sizeBytes: doc.size_bytes,
          uploadedAt: doc.uploaded_at,
        },
        hint: "문서 판독은 POST /v1/cases/{caseId}/analyze 실행 시 함께 수행됩니다.",
      },
      201,
    );
  },
);

documentsRoute.get("/:caseId/documents", zValidator("param", caseParam), async (c) => {
  const { caseId } = c.req.valid("param");
  const db = await assertOwnership(c.get("accessToken"), caseId);
  const docs = await listDocuments(db, caseId);
  return c.json({
    documents: docs.map((d) => ({
      id: d.id,
      docType: d.doc_type,
      status: d.status,
      originalName: d.original_name,
      mimeType: d.mime_type,
      sizeBytes: d.size_bytes,
      errorMessage: d.error_message,
      uploadedAt: d.uploaded_at,
      parsedAt: d.parsed_at,
    })),
  });
});

/** 사용자가 업로드한 문서를 다시 볼 수 있게 짧은 수명의 서명 URL을 준다. */
documentsRoute.get(
  "/:caseId/documents/:documentId/download-url",
  zValidator("param", docParam),
  async (c) => {
    const { caseId, documentId } = c.req.valid("param");
    await assertOwnership(c.get("accessToken"), caseId);
    const url = await createSignedDownload(caseId, documentId, 300);
    return c.json({ url, expiresInSeconds: 300 });
  },
);

documentsRoute.delete(
  "/:caseId/documents/:documentId",
  zValidator("param", docParam),
  async (c) => {
    const { caseId, documentId } = c.req.valid("param");
    await assertOwnership(c.get("accessToken"), caseId);
    await deleteDocument(caseId, documentId);
    return c.body(null, 204);
  },
);
