/**
 * Public barrel for the ruleset cache layer's types. See `./rulesetCache/index.ts` for the API surface (consumer
 * invalidation + framework accessors); services read it through `withRulesetScope`.
 */
export type { CachedCowData, CachedRulesetData } from "./rulesetCache/index.ts";

export { default as DependentCache } from "./DependentCache.ts";
export { setCacheEnabled } from "./MemoryCache.ts";
