/** Copy-on-write's state: a ruleset's source chain, the copies that override its sources' entities, and the siblings. */

export { default as CowData } from "./CowData.ts";
export { default as CowDataBuilder } from "./CowDataBuilder.ts";
export { checkExtensionNames, NAME_PAIRED_ENTITY_TYPES } from "./extensionNames.ts";
export { buildSourceChain, getCowReads, getPairedKlassIds } from "./sources.ts";
export type { CowRows, RulesetSources } from "./sources.ts";
