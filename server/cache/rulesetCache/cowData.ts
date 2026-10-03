import { type CowData, getOrBuildCowData as getOrBuildCowDataFromCow } from "@/server/services/rulesets/cow/index.ts";

export type CachedCowData = CowData;

/**
 * Cache helpers always read via the imported `db` (committed state). They never
 * accept a tx handle — that would let an in-progress mutation's uncommitted
 * writes leak into the global cache for every concurrent reader.
 */
export async function getOrBuildCowData(ruleset: {
  id: string;
  extensionRulesetIds: string[];
  ancestorRulesetIds: string[];
}): Promise<CachedCowData> {
  return getOrBuildCowDataFromCow(ruleset);
}
