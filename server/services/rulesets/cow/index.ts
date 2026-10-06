/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     `withRulesetScope` / `withRulesetScopes` for single / multi-ruleset
 *     reads. `findScopedEntity` finds an entity in the composed view, and
 *     `cowEntityToEdit` / `cowEntityToDelete` the row a CRUD mutation writes (copying
 *     it when inherited). `cowEntity` / `cowEntityForCustomization` and the
 *     `lockEntityForMutation` / `hasCharacterPicks` helpers for the rest.
 *     `cowCustomizationForMutation` resolves the row a customization update or delete changes.
 *
 *   Copy primitives: `fetchEntityCustomizations` /
 *     `copyEntityCustomizations*` (the COW write path and the item /
 *     modifier duplicate flows), and `NAME_FALLBACK_ENTITY_TYPES`
 *     (`RulesetsService`'s extension flows). A fork copies no rows: `cowEntity` copies an entity on its first edit.
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
  cowEntityToDelete,
  cowEntityToEdit,
  findScopedEntity,
} from "./cowEntity.ts";
export { withRulesetScope, withRulesetScopes } from "./cowData.ts";
export {
  assertAncestorNamesHidden,
  assertEntityNameAvailable,
  repointTombstoneSnapshot,
  wasGeneratedFeat,
} from "./entityNames.ts";
export { hasCharacterPicks } from "./characterPicks.ts";
export { ENTITY_REPOS, NAME_FALLBACK_ENTITY_TYPES } from "./constants.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copy.ts";

/** Framework internals — cache compose step + ruleset implementations. */
export { buildSourceChain, refreshEntityData, resolveOverrides } from "./overrideMap.ts";
export { getOrBuildCowData, invalidateAllCowData, invalidateCowData } from "./cowData.ts";

/** Merging a fork's requirements with its sources' (rulesetCache/compose.ts). */
export { mergeSiblingRequirements } from "./requirements.ts";

export type { CowData, IdResolveMap } from "@/server/database/index.ts";
export { type EntityType } from "./hashing.ts";
