import DependentCache from "@/server/cache/DependentCache.ts";
import type { TargetPath } from "@/shared/customization/target.ts";

export const targetPathsAndLabelsCache = new DependentCache<{
  paths: TargetPath[];
  segmentLabels: Record<string, string>;
}>();

export async function getOrFetchTargetPathsAndLabels(
  rulesetId: string,
  kind: "modifier" | "requirement",
  fetcher: () => Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }>,
  sourceChain: readonly string[] = [],
): Promise<{ paths: TargetPath[]; segmentLabels: Record<string, string> }> {
  // Old subscription metadata must not populate the key for the new chain.
  const key = JSON.stringify([rulesetId, kind, ...sourceChain]);
  return targetPathsAndLabelsCache.getOrFetch(key, [rulesetId, ...sourceChain], async () => ({
    data: await fetcher(),
  }));
}
