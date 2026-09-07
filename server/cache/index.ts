/**
 * Public barrel for the ruleset cache layer. See `./rulesetCache.ts` for the
 * API surface (consumer invalidation + framework accessors).
 */
export { default as MemoryCache } from "./MemoryCache.ts";
export {
  // Consumer invalidation + boot warm-up.
  invalidateAll,
  invalidateRuleset,
  invalidateRulesetEntities,
  warmSystemRulesetCache,

  // Framework accessors — services use `withRulesetScope` from
  // `services/rulesets/cow.ts` instead.
  getOrBuildCowData,
  getOrFetchRulesetData,
} from "./rulesetCache.ts";
export type { CachedCowData, CachedRulesetData } from "./rulesetCache.ts";
