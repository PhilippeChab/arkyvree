/** A record's image as v1 answers it: a user's avatar, a character's portrait. */

import { z } from "zod";

import { v1Id } from "./references.ts";

export const v1Attachment = z
  .strictObject({
    id: v1Id.meta({ description: "`DELETE /v1/attachments/{id}` removes it" }),
    url: z.string().nullable().meta({ description: "Where it's read, none when the storage serves no public URL" }),
  })
  .meta({ description: "A record's image: a user's avatar, a character's portrait", id: "Attachment" });
