/**
 * ──────────────────────────────────────────────────────────────────────────
 * Public API.
 *
 *   Consumer surface (any service or route):
 *     `withRulesetScope` / `withRulesetScopes` for single / multi-ruleset
 *     reads. `cowEntity` / `cowEntityForCustomization` and the
 *     `lockEntityForMutation` / `delete*WithCascade` helpers for admin CRUD mutations.
 *     `findPropertyForCustomization` validates stored property ownership.
 *
 *   Forking primitives (only `RulesetsService` fork/publish):
 *     `buildOverrideMap`, `copyEntity*`, `fetch*`,
 *     `ENTITY_TYPE_TO_SOURCE_TYPE`. These live here because they share
 *     utilities with the runtime COW path; they aren't "internal" in any
 *     enforceable sense — they're just owned by the fork flow.
 *
 *   Framework internals (used by the cache compose step + the ruleset
 *     implementation layer — `DetailedCharacterDataLoader`, `TargetPaths`,
 *     `LevelUpProjector`): `getOrBuildCowData`, `invalidateCowData`,
 *     `invalidateAllCowData`, `refreshEntityData`, `resolveOverrides`,
 *     `buildSourceChain` (also shared with fork/publish).
 * ──────────────────────────────────────────────────────────────────────────
 */
export {
  lockEntityForMutation,
  findPropertyForCustomization,
  cowEntity,
  cowEntityForCustomization,
} from "./cowEntity.ts";
export { withRulesetScope, withRulesetScopes } from "./cowData.ts";
export { assertEntityNameAvailable, repointTombstoneSnapshot } from "./entityNames.ts";
export {
  deleteModifiersWithCascade,
  deletePropertiesWithCascade,
  deleteRequirementsWithCascade,
  entityHasCharacterPicks,
} from "./cascade.ts";

// Forking primitives — RulesetsService only.
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
