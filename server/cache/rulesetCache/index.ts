/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     Invalidation + the boot warm-up. Mutations must call `invalidateRuleset`
 *     (or `invalidateRulesetEntities` for customization-only changes).
 *     `invalidateAll` is the nuclear option.
 *
 *   Framework accessors:
 *     `getOrBuildCowData`, `getOrFetchRulesetData` — called by
 *     `withRulesetScope`. `getOrFetchTargetPathsAndLabels` — called by
 *     `TargetPathsService`. `getOrFetchRulesetRawData`, `isRulesetRawDataPinned`
 *     — used by cache regression tests to assert raw-tier pinning behaviour.
 *     None are for generic service use — they go through `withRulesetScope`.
 * ──────────────────────────────────────────────────────────────────────────
 */
export { getOrBuildCowData, type CachedCowData } from "./cowData.ts";
export { getOrFetchRulesetData, type CachedRulesetData } from "./compose.ts";
export { invalidateAll, invalidateRuleset, invalidateRulesetEntities, warmSystemRulesetCache } from "./invalidation.ts";
export { getOrFetchRulesetRawData, isRulesetRawDataPinned } from "./rawData.ts";
export { getOrFetchTargetPathsAndLabels } from "./targetPaths.ts";
