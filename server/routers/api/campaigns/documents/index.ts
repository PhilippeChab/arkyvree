import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { BadRequestError } from "@/server/errors/index.ts";
import { attachmentUploadRateLimit, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { documentName, idParam } from "@/server/routers/api/validation.ts";
import { CampaignDocumentFilesService } from "@/server/services/campaigns/documents/files/index.ts";
import { CampaignDocumentsService } from "@/server/services/campaigns/documents/index.ts";
import { MAX_DOCUMENT_FILE_BYTES } from "@/shared/attachments.ts";
import { DOCUMENT_KINDS, DOCUMENT_VISIBILITY_OPTIONS, MAX_DOCUMENT_BODY_LENGTH } from "@/shared/campaignDocuments.ts";

const documentParams = idParam.extend({ documentId: z.string().uuid() });

/** A document's text, as its Game Master wrote it. */
const documentText = z.string().max(MAX_DOCUMENT_BODY_LENGTH);

/** What a form adds to its file: each part's boundary and headers. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/** The seats a Selected folder or document admits. */
const readerIds = z.array(z.string().uuid());

export default new Hono<SessionContext>()
  .get("/:id/documents", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await CampaignDocumentsService.getDocuments(c.var.requestSession, id), 200);
  })
  .get("/:id/documents/:documentId", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    return c.json(await CampaignDocumentsService.getDocument(c.var.requestSession, id, documentId), 200);
  })
  // A document's file: its bytes, handed on by the server to whoever sees the document, never a public URL
  .get("/:id/documents/:documentId/file", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    const file = await CampaignDocumentFilesService.getDocumentFile(c.var.requestSession, id, documentId);
    return c.body(file.data, 200, {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Type": file.contentType,
      "X-Content-Type-Options": "nosniff",
    });
  })
  .post(
    "/:id/documents",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        kind: z.enum(DOCUMENT_KINDS),
        name: documentName,
        body: documentText.optional(),
        parentId: z.string().uuid().nullable().default(null),
        visibility: z.enum(DOCUMENT_VISIBILITY_OPTIONS).default("Private"),
        readerIds: readerIds.default([]),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await CampaignDocumentsService.createDocument(c.var.requestSession, id, body), 201);
    },
  )
  .put(
    "/:id/documents/:documentId",
    validate("param", documentParams),
    validate(
      "json",
      z.object({
        name: documentName.optional(),
        body: documentText.optional(),
        parentId: z.string().uuid().nullable().optional(),
        visibility: z.enum(DOCUMENT_VISIBILITY_OPTIONS).optional(),
        readerIds: readerIds.optional(),
        updatedAt: z.string().optional(),
      }),
    ),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      const body = c.req.valid("json");
      return c.json(await CampaignDocumentsService.updateDocument(c.var.requestSession, id, documentId, body), 200);
    },
  )
  .put(
    "/:id/documents/:documentId/file",
    attachmentUploadRateLimit,
    // Refused before its body is read whole: a part's headers take a few bytes past the file
    bodyLimit({
      maxSize: MAX_DOCUMENT_FILE_BYTES + FORM_OVERHEAD_BYTES,
      onError: () => {
        throw new BadRequestError(`File exceeds maximum size of ${MAX_DOCUMENT_FILE_BYTES} bytes`);
      },
    }),
    validate("param", documentParams),
    validate("form", z.object({ file: z.file() })),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      const { file } = c.req.valid("form");
      return c.json(
        await CampaignDocumentFilesService.setDocumentFile(c.var.requestSession, id, documentId, file),
        200,
      );
    },
  )
  .delete("/:id/documents/:documentId", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    return c.json(await CampaignDocumentsService.removeDocument(c.var.requestSession, id, documentId), 200);
  })
  .delete("/:id/documents/:documentId/file", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    return c.json(await CampaignDocumentFilesService.removeDocumentFile(c.var.requestSession, id, documentId), 200);
  });
