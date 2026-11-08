import { Hono } from "hono";
import { z } from "zod";

import { type SessionContext, validate } from "@/server/middlewares/index.ts";
import { documentName, idParam } from "@/server/routers/api/validation.ts";
import { CampaignDocumentsService } from "@/server/services/campaigns/documents/index.ts";
import { DOCUMENT_KINDS, DOCUMENT_VISIBILITY_OPTIONS, MAX_DOCUMENT_BODY_LENGTH } from "@/shared/campaignDocuments.ts";

const documentParams = idParam.extend({ documentId: z.string().uuid() });

/** A document's text, as its Game Master wrote it. */
const documentText = z.string().max(MAX_DOCUMENT_BODY_LENGTH);

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
  .delete("/:id/documents/:documentId", validate("param", documentParams), async (c) => {
    const { id, documentId } = c.req.valid("param");
    return c.json(await CampaignDocumentsService.removeDocument(c.var.requestSession, id, documentId), 200);
  });
