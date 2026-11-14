import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { TargetPathKind } from "@/shared/customization/target.ts";

import { seedTargetPath, type TargetPathOwner, targetPathQuery } from "./customizationQueries.ts";
import { knownPathInfo, type PathInfo } from "./pathValues.ts";

/**
 * What the path a modifier or requirement targets takes, once it's a complete path its entity type takes; null while
 * it's incomplete or unknown. `pick` remembers a path picked from a list, which carried what it takes, so it shows at
 * once. A path it loaded keeps what it took while a refresh finds it no more (`knownPathInfo`).
 */
export function useTargetPath(
  rulesetId: string,
  kind: TargetPathKind,
  entityType: TargetPathOwner | undefined,
  path: string,
) {
  const queryClient = useQueryClient();
  const { data, error } = useQuery(targetPathQuery(rulesetId, kind, path, entityType));
  // What it last loaded, kept as it renders (React's "storing information from previous renders")
  const [last, setLast] = useState<PathInfo | null>(null);
  if (data && data !== last) setLast(data);
  const pick = (picked: PathInfo) => seedTargetPath(queryClient, rulesetId, kind, picked, entityType);
  return { target: knownPathInfo(data, last, path), error, pick };
}
