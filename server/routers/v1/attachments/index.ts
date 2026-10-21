import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { BadRequestError } from "@/server/errors/index.ts";
import {
  apiAttachmentUploadRateLimit,
  type ApiKeyContext,
  describeRoute,
  validate,
} from "@/server/middlewares/index.ts";
import { idParam } from "@/server/routers/api/validation.ts";
import { v1Attachment } from "@/server/routers/v1/schemas/attachments.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { AttachmentsService, getPublicUrl } from "@/server/services/attachments/index.ts";
import { MAX_UPLOAD_BYTES } from "@/shared/attachments.ts";

/** What a form adds to its file: each part's boundary and headers. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

/** A record's image slot: the record, and the slot's name. */
const slot = {
  name: z.string().min(1).meta({ description: "The slot: a user's `avatar`, a character's `portrait`" }),
  recordId: z.string().uuid().meta({ description: "The user's or the character's id" }),
  recordType: z.string().min(1).meta({ description: "`User` for an avatar, `Character` for a portrait" }),
};

/**
 * The images records keep (a user's avatar, a character's portrait): one, its upload, in one request that stores and
 * attaches it or leaves nothing, and its removal.
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
    "/",
    describeRoute({
      response: v1Attachment,
      status: 201,
      summary:
        "Uploads an image into a record's slot the key's user may change, replacing the image there: a PNG, JPEG, " +
        "WebP or GIF, 5 MB at most, sent as `multipart/form-data`",
    }),
    apiAttachmentUploadRateLimit,
    // Refused before its body is read whole: a part's headers take a few bytes past the file
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + FORM_OVERHEAD_BYTES,
      onError: () => {
        throw new BadRequestError(`File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes`);
      },
    }),
    validate(
      "form",
      z.object({
        ...slot,
        file: z.file().meta({ description: "The image: its type is read from its bytes, whatever its part declares" }),
      }),
    ),
    async (c) => {
      const { file, name, recordId, recordType } = c.req.valid("form");
      const session = c.var.requestSession;
      // What it attached, as its write left it: another request may replace it since
      const { attachment, blob } = await AttachmentsService.setAttachment(session, {
        file,
        name,
        recordId,
        recordType,
      });
      return c.json(V1.attachment({ id: attachment.id, url: getPublicUrl(blob) }), 201);
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
