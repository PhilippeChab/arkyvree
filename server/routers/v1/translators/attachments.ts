/** A record's image as v1 answers it, and where to upload one. */

import type { z } from "zod";

import type { v1Attachment, v1DirectUpload } from "@/server/routers/v1/schemas/attachments.ts";
import type { AttachmentsService } from "@/server/services/attachments/index.ts";

import type { Answer } from "./answers.ts";

/** A record's image in its slot. */
export function toV1Attachment({
  id,
  url,
}: NonNullable<Answer<typeof AttachmentsService.getAttachment>>): z.infer<typeof v1Attachment> {
  return { id, url };
}

/** Where to upload a file, with what, and what attaches it once it's there. */
export function toV1DirectUpload({
  headers,
  presignedUrl,
  signedId,
}: Answer<typeof AttachmentsService.createDirectUpload>): z.infer<typeof v1DirectUpload> {
  return { headers, signedId, uploadUrl: presignedUrl };
}
