/**
 * The ruleset cache: `RulesetCache`, each ruleset's view composed by copy-on-write's read side, which reads make in a
 * ruleset's scope (`withRulesetScope`, `withRulesetScopes`); its copy-on-write data (`RulesetCache.getCowData`, built
 * by `CowDataBuilder`: the source chain, the overrides, the sibling pairs), whose invalidation every change to a
 * ruleset makes; and the warm-up the server makes at boot.
 */
export { buildSourceChain, default as CowDataBuilder, NAME_FALLBACK_ENTITY_TYPES } from "./CowDataBuilder.ts";
export { findScopedEntity } from "./findScopedEntity.ts";
export { default as RulesetCache } from "./RulesetCache.ts";
export { default as RulesetData } from "./RulesetData.ts";
export { withRulesetScope, withRulesetScopes } from "./scope.ts";
export {
  mergeSiblingAptitudeLinks,
  mergeSiblingModifiers,
  mergeSiblingProperties,
  mergeSiblingRequirements,
} from "./siblingMerge.ts";
