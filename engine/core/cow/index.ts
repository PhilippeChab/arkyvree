/** Copy-on-write's state: a ruleset's source chain, the copies that override its sources' entities, and the siblings. */

export { default as CowData } from "./CowData.ts";
export { default as CowDataBuilder } from "./CowDataBuilder.ts";
export { checkExtensionNames } from "./extensionNames.ts";
export { buildSourceChain, getCowReads, getPairedKlassIds, NAME_FALLBACK_ENTITY_TYPES } from "./sources.ts";
export type { CowRows, RulesetSources } from "./sources.ts";
