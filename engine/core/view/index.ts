/**
 * A ruleset's view: its own rows and its source chain's, composed by copy-on-write (`RulesetComposition`) into the
 * `RulesetData` every read of a ruleset sees, the rules a sibling's rows merge by, and the entities a request names as
 * the view reads them (`RequestIds`).
 */

export { default as RequestIds } from "./RequestIds.ts";
export { default as RulesetComposition, type RulesetRawData } from "./RulesetComposition.ts";
export { default as RulesetData, type ViewEntities } from "./RulesetData.ts";
export type { RulesetView } from "./RulesetData.ts";
export { type EntityCustomizations, default as SiblingMerge } from "./SiblingMerge.ts";
