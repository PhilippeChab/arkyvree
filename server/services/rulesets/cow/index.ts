/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     `withRulesetScope` / `withRulesetScopes` for single / multi-ruleset
 *     reads. `cowEntity` / `cowEntityForCustomization` and the
 *     `lockEntityForMutation` / `delete*WithCascade` helpers for admin CRUD mutations.
 *     `cowCustomizationForMutation` resolves the row a customization update or delete changes.
 *
 *   Copy primitives: `fetchEntityCustomizations` /
 *     `copyEntityCustomizations*` (the COW write path and the item /
 *     modifier duplicate flows), `ENTITY_TYPE_TO_SOURCE_TYPE` and
 *     `NAME_FALLBACK_ENTITY_TYPES` (`RulesetsService`'s extension and
 *     revert flows), and `buildOverrideMap`, which only `cow/` calls. A
 *     fork copies no rows: `cowEntity` copies an entity on its first edit.
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
export { assertAncestorNamesHidden, assertEntityNameAvailable, repointTombstoneSnapshot } from "./entityNames.ts";
export {
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
} from "./cascade.ts";

// Copy primitives.
export { buildOverrideMap } from "./overrideMap.ts";
export { ENTITY_TYPE_TO_SOURCE_TYPE, NAME_FALLBACK_ENTITY_TYPES } from "./constants.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copy.ts";

// Framework internals — cache compose step + ruleset implementations.
export {
  buildSourceChain,
  refreshEntityData,
  resolveOverrides,
  newOverrideMap,
  newIdResolveMap,
} from "./overrideMap.ts";
export { getOrBuildCowData, invalidateAllCowData, invalidateCowData } from "./cowData.ts";

// Requirement forest helpers — shared between cow (write-time merge) and
// rulesetCache.ts (read-time compose).
export {
  buildReqForest,
  serializeReqNode,
  mergeSiblingRequirements,
  dedupAgainstExisting,
  collectAllLeafKeys,
  collectTopLevelStandaloneKeys,
} from "./requirements.ts";

export type { EntityWithId } from "./constants.ts";
export type { ReqNode } from "./requirements.ts";
export type { OverrideMap, IdResolveMap } from "./overrideMap.ts";
export type { CowData } from "./cowData.ts";
