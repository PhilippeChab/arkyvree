import { useQuery, useQueryClient } from "@tanstack/react-query";

import { seedTargetPath, targetPathQuery } from "./customizationQueries.ts";
import type { PathInfo } from "./pathValues.ts";

/**
 * What the path a modifier or requirement targets takes, once it's a complete path its entity type takes; null while
 * it's incomplete or unknown. `pick` remembers a path picked from a list, which carried what it takes, so it shows at
 * once.
 */
export function useTargetPath(
  rulesetId: string,
  kind: "modifier" | "requirement",
  entityType: string | undefined,
  path: string,
) {
  const queryClient = useQueryClient();
  const { data } = useQuery(targetPathQuery(rulesetId, kind, path, entityType));
  const pick = (picked: PathInfo) => seedTargetPath(queryClient, rulesetId, kind, picked, entityType);
  return { target: data ?? null, pick };
}
