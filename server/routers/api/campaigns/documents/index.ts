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

/** A note's text, as its Game Master wrote it. */
const documentText = z.string().max(MAX_DOCUMENT_BODY_LENGTH);

/** What a form adds to its file: each part's boundary and headers. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/** Refuses a file's form before its body is read whole: a part's headers take a few bytes past the file. */
const fileLimit = bodyLimit({
  maxSize: MAX_DOCUMENT_FILE_BYTES + FORM_OVERHEAD_BYTES,
  onError: () => {
    throw new BadRequestError(`File exceeds maximum size of ${MAX_DOCUMENT_FILE_BYTES} bytes`);
  },
});

/** The seats a Selected folder, document or note admits. */
const readerIds = z.array(z.string().uuid());

/** A form's seats: one field for each, which a form with one alone sends as a string. */
const formReaderIds = z
  .union([z.string().uuid(), readerIds])
  .optional()
  .transform((ids) => (ids === undefined ? [] : [ids].flat()));

/**
 * A file's `Content-Disposition`, shown in the browser under its name: an ASCII name for the browsers that read no
 * other, and its own (RFC 5987), whose encoding escapes what `encodeURIComponent` leaves (`'`, `(`, `)`, `*`), which a
 * browser would read as its syntax and drop the name for.
 */
function toInlineDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

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
      "Content-Disposition": toInlineDisposition(file.filename),
      // A text file's bytes are UTF-8 (its upload's check)
      "Content-Type": file.contentType === "text/plain" ? "text/plain; charset=utf-8" : file.contentType,
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
  // A document: the file its Game Master uploads, with its name, its folder and whom it admits
  .post(
    "/:id/documents/upload",
    attachmentUploadRateLimit,
    fileLimit,
    validate("param", idParam),
    validate(
      "form",
      z.object({
        file: z.file(),
        name: documentName,
        // A form's field is text: none, or an empty one, is the top
        parentId: z
          .union([z.literal(""), z.string().uuid()])
          .optional()
          .transform((id) => id || null),
        visibility: z.enum(DOCUMENT_VISIBILITY_OPTIONS).default("Private"),
        readerIds: formReaderIds,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { file, ...document } = c.req.valid("form");
      return c.json(
        await CampaignDocumentFilesService.createDocumentFile(c.var.requestSession, id, document, file),
        201,
      );
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
    fileLimit,
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
  });
