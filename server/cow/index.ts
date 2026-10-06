/**
 * Copy-on-write's write side: the row a change to a ruleset's entity or customization writes, copying an inherited one
 * on its first edit (`cowEntity`, `cowEntityToEdit`, `cowEntityToDelete`, `cowEntityForCustomization`,
 * `cowCustomizationForMutation`, `lockEntityForMutation`), what a copy copies (`copyEntityCustomizations*`,
 * `fetchEntityCustomizations`), and the checks a change makes (`findScopedEntity`, `hasCharacterPicks`, the names).
 * Its read side, the view a ruleset's reads see (`withRulesetScope`), is the cache's (`cache/rulesetCache/`).
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
export {
  assertAncestorNamesHidden,
  assertEntityNameAvailable,
  repointTombstoneSnapshot,
  wasGeneratedFeat,
} from "./entityNames.ts";
export { hasCharacterPicks } from "./characterPicks.ts";
export { ENTITY_REPOS } from "./constants.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copy.ts";

export { type EntityType } from "./hashing.ts";
