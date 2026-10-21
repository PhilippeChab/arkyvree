import { Hono } from "hono";
import { z } from "zod";

import {
  apiAttachmentUploadRateLimit,
  type ApiKeyContext,
  describeRoute,
  validate,
} from "@/server/middlewares/index.ts";
import { idParam, signedIdParam } from "@/server/routers/api/validation.ts";
import { v1Attachment, v1DirectUpload } from "@/server/routers/v1/schemas/attachments.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { AttachmentsService, getPublicUrl } from "@/server/services/attachments/index.ts";

/** A record's image slot: the record, and the slot's name. */
const slot = {
  name: z.string().min(1).meta({ description: "The slot: a user's `avatar`, a character's `portrait`" }),
  recordId: z.string().uuid().meta({ description: "The user's or the character's id" }),
  recordType: z.string().min(1).meta({ description: "`User` for an avatar, `Character` for a portrait" }),
};

/**
 * The images records keep (a user's avatar, a character's portrait): one, its upload, which goes in two steps, and its
 * removal. An upload asks where to send the file (`POST /v1/attachments/direct-uploads`), sends it there with `PUT`,
 * then attaches it to its slot with the upload's `signedId`, replacing the image there.
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/",
    describeRoute({
      response: v1Attachment.nullable(),
      status: 200,
      summary: "A record's image in a slot, none when it's empty",
    }),
    validate("query", z.object(slot)),
    async (c) => {
      const query = c.req.valid("query");
      const attachment = await AttachmentsService.getAttachment(c.var.requestSession, query);
      return c.json(attachment && V1.attachment(attachment), 200);
    },
  )
  .post(
    "/direct-uploads",
    describeRoute({
      response: v1DirectUpload,
      status: 200,
      summary:
        "Where to upload an image for a record's slot the key's user may change: a PNG, JPEG, WebP or GIF, 5 MB at " +
        "most",
    }),
    apiAttachmentUploadRateLimit,
    validate(
      "json",
      z.object({
        ...slot,
        byteSize: z.number().int().positive(),
        contentType: z.string().min(1).meta({ description: "`image/png`, `image/jpeg`, `image/webp` or `image/gif`" }),
        filename: z.string().min(1),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      return c.json(V1.directUpload(await AttachmentsService.createDirectUpload(c.var.requestSession, body)), 200);
    },
  )
  .post(
    "/:signedId/attach",
    describeRoute({
      response: v1Attachment,
      status: 200,
      summary: "Attaches an uploaded file to the slot its upload was for, replacing the image there",
    }),
    validate("param", signedIdParam),
    async (c) => {
      const { signedId } = c.req.valid("param");
      // What it attached, as its write left it: another request may replace it since
      const { attachment, blob } = await AttachmentsService.attach(c.var.requestSession, signedId);
      return c.json(V1.attachment({ id: attachment.id, url: getPublicUrl(blob) }), 200);
    },
  )
  .delete(
    "/:id",
    describeRoute({ response: null, status: 204, summary: "Removes a record's image the key's user may change" }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      await AttachmentsService.detach(c.var.requestSession, id);
      return c.body(null, 204);
    },
  );
