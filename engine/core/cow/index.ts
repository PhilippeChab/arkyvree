/** Copy-on-write's state: a ruleset's source chain, the copies that override its sources' entities, and the siblings. */

export { default as CowData } from "./CowData.ts";
export { default as CowDataBuilder } from "./CowDataBuilder.ts";
export { type CowRows, default as CowSources, type RulesetSources } from "./CowSources.ts";
export { default as ExtensionNames, NAME_PAIRED_ENTITY_TYPES } from "./ExtensionNames.ts";
