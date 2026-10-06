/**
 * The ruleset cache: `RulesetCache`, each ruleset's view composed by copy-on-write's read side, which reads make in a
 * ruleset's scope (`withRulesetScope`, `withRulesetScopes`); its copy-on-write data (`getOrBuildCowData`: the source
 * chain, the override map), whose invalidation every change to a ruleset makes; and the warm-up the server makes at
 * boot.
 */
export { type CachedCowData, type CachedRulesetData } from "./compose.ts";
export { getOrBuildCowData, invalidateAllCowData, invalidateCowData } from "./cowData.ts";
export {
  buildOverrideMap,
  buildSourceChain,
  NAME_FALLBACK_ENTITY_TYPES,
  refreshEntityData,
  resolveOverrides,
} from "./overrideMap.ts";
export { default as RulesetCache } from "./RulesetCache.ts";
export { withRulesetScope, withRulesetScopes } from "./scope.ts";
export { mergeSiblingRequirements } from "./siblingRequirements.ts";
