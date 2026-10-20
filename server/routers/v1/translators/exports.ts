/** An export as v1 answers it: a file made in the background, and where it stands. */

import type { z } from "zod";

import type { v1Export } from "@/server/routers/v1/schemas/exports.ts";
import type { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import type { ExportsService } from "@/server/services/exports/index.ts";

/** What a service answers, awaited. */
type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

/** An export, as its queueing or its read answers it. */
export function toV1Export(
  exportRecord:
    | Answer<typeof CampaignCharactersService.enqueuePdf>
    | Answer<typeof CharactersService.enqueuePdf>
    | Answer<typeof ExportsService.getExportStatus>,
): z.infer<typeof v1Export> {
  const { expiresAt, fileName, id, status } = exportRecord;
  return { expiresAt, fileName, id, status };
}
