import { useQueryClient } from "@tanstack/react-query";

import { rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { allLevelSaves } from "@/client/src/pages/rulesets/components/forms/index.ts";

/** A class level's saves as its form holds them: each its save and its base. */
type LevelSaves = Parameters<typeof allLevelSaves>[1];

/**
 * A class level's saves as its save sends them (`withAllSaves`): every ruleset save, 0 unset, off the saves its form's
 * input loaded (`AmountsInput`, which shows their failure); its own until they load.
 */
export function useAllLevelSaves(rulesetId: string) {
  const queryClient = useQueryClient();
  const withAllSaves = (saves: LevelSaves) =>
    allLevelSaves(queryClient.getQueryData(rulesetOptionsQuery("saves", rulesetId).queryKey), saves);
  return { withAllSaves };
}
