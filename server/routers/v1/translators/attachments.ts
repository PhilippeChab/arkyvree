/** A record's image as v1 answers it. */

import type { z } from "zod";

import type { v1Attachment } from "@/server/routers/v1/schemas/attachments.ts";
import type { AttachmentsService } from "@/server/services/attachments/index.ts";

import type { Answer } from "./answers.ts";

/** A record's image in its slot. */
export function toV1Attachment({
  id,
  url,
}: NonNullable<Answer<typeof AttachmentsService.getAttachment>>): z.infer<typeof v1Attachment> {
  return { id, url };
}
