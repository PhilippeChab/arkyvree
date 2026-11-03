/** An export as v1 answers it: a file the app makes in the background (a character's PDF), and where it stands. */

import { z } from "zod";

import type { ExportStatus } from "@/shared/enums.ts";

import { v1Id } from "./references.ts";

/**
 * Where an export stands, as v1 names it: written out, so that a status the app adds or drops stops v1's translator
 * compiling, rather than changing v1's answers.
 */
const V1_EXPORT_STATUSES = ["pending", "ready", "failed"] as const satisfies readonly ExportStatus[];

export const v1Export = z
  .strictObject({
    expiresAt: z.string().meta({
      description: "When it's deleted: an hour after its file is ready, or a day after it's queued while it waits",
    }),
    fileName: z.string(),
    id: v1Id.meta({
      description: "`GET /v1/exports/{id}` answers whether it's ready, `GET /v1/exports/{id}/download` its file",
    }),
    status: z.enum(V1_EXPORT_STATUSES).meta({
      description:
        "`pending` while it's made, `ready` once its file can be downloaded, or `failed`: one whose render was read " +
        "as lost may still turn `ready`, which a notification tells",
    }),
  })
  .meta({ description: "A file the app makes in the background, a character's PDF: where it stands", id: "Export" });
