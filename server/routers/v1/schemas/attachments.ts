/** A record's image as v1 answers it (a user's avatar, a character's portrait), and an upload of one. */

import { z } from "zod";

import { v1Id } from "./references.ts";

export const v1Attachment = z
  .strictObject({
    id: v1Id.meta({ description: "`DELETE /v1/attachments/{id}` removes it" }),
    url: z.string().nullable().meta({ description: "Where it's read, none when the storage serves no public URL" }),
  })
  .meta({ description: "A record's image: a user's avatar, a character's portrait", id: "Attachment" });

export const v1DirectUpload = z
  .strictObject({
    headers: z.record(z.string(), z.string()).meta({ description: "The headers the upload sends" }),
    signedId: z.string().meta({
      description: "What attaches the file once it's uploaded: `POST /v1/attachments/{signedId}/attach`, within a day",
    }),
    uploadUrl: z.string().meta({ description: "Where the file is sent, with `PUT`: the storage's, signed" }),
  })
  .meta({ description: "Where to upload a file, and what attaches it once it's there", id: "DirectUpload" });
