import { type Context, Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";

import { BadRequestError } from "@/server/errors/index.ts";
import { attachmentUploadRateLimit, type SessionContext, validate } from "@/server/middlewares/index.ts";
import { documentName, idParam } from "@/server/routers/api/validation.ts";
import { CampaignDocumentFilesService } from "@/server/services/campaigns/documents/files/index.ts";
import { CampaignDocumentsService } from "@/server/services/campaigns/documents/index.ts";
import { MAX_DOCUMENT_FILE_BYTES, WORD_DOCUMENT_TYPE } from "@/shared/attachments.ts";
import { DOCUMENT_KINDS, DOCUMENT_VISIBILITY_OPTIONS, MAX_DOCUMENT_BODY_LENGTH } from "@/shared/campaignDocuments.ts";

const documentParams = idParam.extend({ documentId: z.string().uuid() });

/** A note's text, as its Game Master wrote it. */
const documentText = z.string().max(MAX_DOCUMENT_BODY_LENGTH);

/**
 * Refuses a file whose request says it's larger than a document takes, before a byte of it is read. One that says
 * nothing is counted as it's stored (`AttachmentsService`), never held whole, as Hono's `bodyLimit` would hold it.
 */
const fileLimit = createMiddleware(async (c, next) => {
  if (Number(c.req.header("content-length")) > MAX_DOCUMENT_FILE_BYTES)
    throw new BadRequestError(`File exceeds maximum size of ${MAX_DOCUMENT_FILE_BYTES} bytes`);
  await next();
});

/** A file's name, which its request's query carries beside its bytes. */
const filename = z.string().min(1);

/** The seats a Selected folder, document or note admits. */
const readerIds = z.array(z.string().uuid());

/** A query's seats: one parameter for each, which a query with one alone reads as a string. */
const queryReaderIds = z
  .union([z.string().uuid(), readerIds])
  .optional()
  .transform((ids) => (ids === undefined ? [] : [ids].flat()));

/**
 * How long an upload's connection may go without a byte, in seconds, past Bun's 10: one waiting its turn
 * (`UploadQueue`, 30 seconds at most) reads none, nor one whose last part S3 is still storing.
 */
const UPLOAD_IDLE_SECONDS = 120;

/**
 * A file's `Content-Disposition`, under its name: shown in the browser, or saved (`attachment`) for a Word document,
 * which no browser shows. An ASCII name for the browsers that read no other, and its own (RFC 5987), whose encoding
 * escapes what `encodeURIComponent` leaves (`'`, `(`, `)`, `*`), which a browser would read as its syntax and drop the
 * name for.
 */
function toDisposition(filename: string, contentType: string) {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const kind = contentType === WORD_DOCUMENT_TYPE ? "attachment" : "inline";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * The file a request's body is (`filename`, its query's), streamed as it comes, never held whole: an empty one when it
 * sends no body.
 */
function toIncomingFile(c: Context, name: string) {
  // Bun's server, which a test's request runs without
  const server = c.env as Partial<Pick<Bun.Server<unknown>, "timeout">> | undefined;
  server?.timeout?.(c.req.raw, UPLOAD_IDLE_SECONDS);
  return { name, stream: () => c.req.raw.body ?? new Response(new Uint8Array()).body! };
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
    const headers = {
      "Cache-Control": "private, no-store",
      "Content-Disposition": toDisposition(file.filename, file.contentType),
      // A text file's bytes are UTF-8 (its upload's check)
      "Content-Type": file.contentType === "text/plain" ? "text/plain; charset=utf-8" : file.contentType,
      // Nothing a picture, a Word document or a text file holds runs, were a browser to read it as a page. No more than
      // that: the browser's own viewer styles what it shows (a picture centered, a text file's lines wrapped), which a
      // stricter policy would strip. A PDF's reader, the browser's, takes none
      ...(file.contentType !== "application/pdf" && { "Content-Security-Policy": "sandbox" }),
      "X-Content-Type-Options": "nosniff",
    };
    // A HEAD asks for the headers alone: the storage's read is let go, not left open behind a body nobody reads
    if (c.req.method === "HEAD") {
      await file.stream.cancel();
      return c.body(null, 200, headers);
    }
    // Handed on as the storage sends it, in chunks: the server holds one at a time, never the file whole
    return c.body(file.stream, 200, headers);
  })
  .post(
    "/:id/documents",
    validate("param", idParam),
    validate(
      "json",
      z.object({
        // A document is the file its upload sends
        kind: z.enum(DOCUMENT_KINDS).exclude(["Document"]),
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
  // A document: the file its Game Master uploads, its bytes the request's body, streamed to the storage as they come;
  // its file's name, its own, its folder and whom it admits, the query's
  .post(
    "/:id/documents/upload",
    attachmentUploadRateLimit,
    fileLimit,
    validate("param", idParam),
    validate(
      "query",
      z.object({
        filename,
        name: documentName,
        // A query's parameter is text: none, or an empty one, is the top
        parentId: z
          .union([z.literal(""), z.string().uuid()])
          .optional()
          .transform((id) => id || null),
        visibility: z.enum(DOCUMENT_VISIBILITY_OPTIONS).default("Private"),
        readerIds: queryReaderIds,
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const { filename: name, ...document } = c.req.valid("query");
      return c.json(
        await CampaignDocumentFilesService.createDocumentFile(
          c.var.requestSession,
          id,
          document,
          toIncomingFile(c, name),
        ),
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
    validate("query", z.object({ filename })),
    async (c) => {
      const { id, documentId } = c.req.valid("param");
      const { filename: name } = c.req.valid("query");
      return c.json(
        await CampaignDocumentFilesService.setDocumentFile(
          c.var.requestSession,
          id,
          documentId,
          toIncomingFile(c, name),
        ),
        200,
      );
    },
  )
  .delete("/:id/documents/:documentId", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    return c.json(await CampaignDocumentsService.removeDocument(c.var.requestSession, id, documentId), 200);
  });
