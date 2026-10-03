/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     `withRulesetScope` / `withRulesetScopes` for single / multi-ruleset
 *     reads. `cowEntity` / `cowEntityForCustomization` and the
 *     `lockEntityForMutation` / `entityHasCharacterPicks` helpers for admin CRUD mutations.
 *     `cowCustomizationForMutation` resolves the row a customization update or delete changes.
 *
 *   Copy primitives: `fetchEntityCustomizations` /
 *     `copyEntityCustomizations*` (the COW write path and the item /
 *     modifier duplicate flows), `ENTITY_TYPE_TO_SOURCE_TYPE` and
 *     `NAME_FALLBACK_ENTITY_TYPES` (`RulesetsService`'s extension and
 *     revert flows). A fork copies no rows: `cowEntity` copies an entity on its first edit.
 *
 *   Framework internals (used by the cache compose step + the ruleset
 *     implementation layer — `DetailedCharacterDataLoader`, `TargetPaths`,
 *     `LevelUpProjector`): `getOrBuildCowData`, `invalidateCowData`,
 *     `invalidateAllCowData`, `refreshEntityData`, `resolveOverrides`,
 *     `buildSourceChain` (also used by `publishRuleset` and `TargetPathsService`).
 * ──────────────────────────────────────────────────────────────────────────
 */
export {
  lockEntityForMutation,
  cowCustomizationForMutation,
  cowEntity,
  cowEntityForCustomization,
} from "./cowEntity.ts";
export { withRulesetScope, withRulesetScopes } from "./cowData.ts";
export {
  assertAncestorNamesHidden,
  assertEntityNameAvailable,
  repointTombstoneSnapshot,
  wasGeneratedFeat,
} from "./entityNames.ts";
export { entityHasCharacterPicks } from "./characterPicks.ts";
export { ENTITY_TYPE_TO_SOURCE_TYPE, NAME_FALLBACK_ENTITY_TYPES } from "./constants.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copy.ts";

// Framework internals — cache compose step + ruleset implementations.
export { buildSourceChain, refreshEntityData, resolveOverrides } from "./overrideMap.ts";
export { getOrBuildCowData, invalidateAllCowData, invalidateCowData } from "./cowData.ts";

// Merging a fork's requirements with its sources' (rulesetCache.ts's compose step).
export { mergeSiblingRequirements } from "./requirements.ts";

export type { IdResolveMap } from "./overrideMap.ts";
export type { CowData } from "./cowData.ts";
