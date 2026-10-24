import { useQuery } from "@tanstack/react-query";

import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";

export type Save = EntityRow;

/** Every save of a ruleset, for pickers, columns and lookups. */
export function useRulesetSaves(rulesetId: string | undefined, enabled = true) {
  return useQuery({ ...rulesetOptionsQuery("saves", rulesetId), enabled });
}
