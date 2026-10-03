import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { invalidateAllCowData, invalidateCowData } from "@/server/services/rulesets/cow/index.ts";

import { getOrFetchRulesetRawData, rulesetRawDataCache } from "./rawData.ts";
import { targetPathsAndLabelsCache } from "./targetPaths.ts";

/**
 * Invalidate only target paths + segment labels cache.
 * Call after mutations that change entity properties (weapon types, spell schools, etc.)
 * but don't affect the entity list itself.
 */
function invalidateTargetPaths(rulesetId: string): void {
  targetPathsAndLabelsCache.invalidate(rulesetId);
}

/**
 * Invalidate COW + raw entity caches (but not target paths).
 * Call after mutations that change entity data but don't affect
 * the set of target paths (e.g. updating an entity's description).
 */
export function invalidateRulesetEntities(rulesetId: string): void {
  invalidateCowData(rulesetId);
  rulesetRawDataCache.invalidate(rulesetId);
}

/**
 * Invalidate all cached data for a ruleset (COW + raw entity data + target paths).
 * Call after mutations that add/remove/rename entities (feats, skills, etc.)
 * since those changes affect the available target paths.
 */
export function invalidateRuleset(rulesetId: string): void {
  invalidateRulesetEntities(rulesetId);
  invalidateTargetPaths(rulesetId);
}

export function invalidateAll(): void {
  invalidateAllCowData();
  rulesetRawDataCache.invalidateAll();
  targetPathsAndLabelsCache.invalidateAll();
}

/**
 * Pre-warm the raw cache with all system-owned rulesets (bases + extensions).
 * Call once at server boot so the first user doesn't pay the cold-read cost.
 */
export async function warmSystemRulesetCache(): Promise<void> {
  const systemRulesets = await Rulesets.findSystemOwned(db);
  await Promise.all(systemRulesets.map((r) => getOrFetchRulesetRawData(r.id)));
}
