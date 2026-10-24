/**
 * A ruleset's view: its own rows and its source chain's, composed by copy-on-write (`RulesetComposition`) into the
 * `RulesetData` every read of a ruleset sees, each kind's and each join's rows by name (typed by the registries each
 * module fills, `ViewEntities` and `ViewJoins`), the rules a sibling's rows merge by, and the entities a request names
 * as the view reads them (`RequestIds`).
 */

export { default as RequestIds } from "./RequestIds.ts";
export type {
  EntityRow,
  LinkRow,
  OwnedEntities,
  OwnedKind,
  Row,
  StandaloneKind,
  ViewEntities,
  ViewJoins,
} from "./rows.ts";
export { default as RulesetComposition, type RulesetRawData, type ViewSchema } from "./RulesetComposition.ts";
export { default as RulesetData } from "./RulesetData.ts";
export type { RulesetView, ViewKind } from "./RulesetData.ts";
export { type EntityCustomizations, default as SiblingMerge } from "./SiblingMerge.ts";
