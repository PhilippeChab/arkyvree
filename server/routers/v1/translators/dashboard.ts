/** The key's user's dashboard as v1 answers it: how many of each record they have. */

import type { z } from "zod";

import type { v1Stats } from "@/server/routers/v1/schemas/dashboard.ts";
import type { DashboardService } from "@/server/services/dashboard/index.ts";

/** How many campaigns, characters and rulesets the key's user has. */
export function toV1Stats({
  totalCampaigns,
  totalCharacters,
  totalRulesets,
}: Awaited<ReturnType<typeof DashboardService.getStats>>): z.infer<typeof v1Stats> {
  return { campaigns: totalCampaigns, characters: totalCharacters, rulesets: totalRulesets };
}
