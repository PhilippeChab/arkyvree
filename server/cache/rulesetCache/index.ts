/**
 * The ruleset cache: `RulesetCache`, each ruleset's view composed by copy-on-write's read side, which reads make in a
 * ruleset's scope (`withRulesetScope`, `withRulesetScopes`); its copy-on-write data (`RulesetCache.getCowData`, built
 * by the engine's `CowDataBuilder` from the rows `readCowData` reads: the source chain, the overrides, the sibling pairs), whose invalidation every change to a
 * ruleset makes; and the warm-up the server makes at boot.
 */
export { readCowData } from "./cowData.ts";
export { default as RulesetCache } from "./RulesetCache.ts";
export { type RulesetScope, withRulesetScope, withRulesetScopes } from "./scope.ts";
export { readTargetPathCatalogs, readTargetPaths } from "./targetPaths.ts";
