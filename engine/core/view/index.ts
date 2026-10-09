/**
 * A ruleset's view: its own rows and its source chain's, composed by copy-on-write (`RulesetComposition`) into the
 * `RulesetData` every read of a ruleset sees, and the rules a sibling's rows merge by.
 */

export { default as RulesetComposition, type RulesetRawData } from "./RulesetComposition.ts";
export { default as RulesetData } from "./RulesetData.ts";
export { type EntityCustomizations, default as SiblingMerge } from "./SiblingMerge.ts";
