/** An export as v1 answers it: a file the app makes in the background (a character's PDF), and where it stands. */

import { z } from "zod";

import { exportStatus } from "@/drizzle/schema.ts";

import { v1Id } from "./references.ts";

export const v1Export = z
  .strictObject({
    expiresAt: z.string().meta({
      description: "When it's deleted: an hour after its file is ready, or a day after it's queued while it waits",
    }),
    fileName: z.string(),
    id: v1Id.meta({
      description: "`GET /v1/exports/{id}` answers whether it's ready, `GET /v1/exports/{id}/download` its file",
    }),
    status: z
      .enum(exportStatus.enumValues)
      .meta({ description: "`pending` while it's made, `ready` once its file can be downloaded, or `failed`" }),
  })
  .meta({ description: "A file the app makes in the background, a character's PDF: where it stands", id: "Export" });
