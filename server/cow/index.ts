/**
 * Copy-on-write's write side: the rows a change to a ruleset's entities writes (`RulesetEdit`: the ruleset's own, or the
 * copy of an inherited one, made on its first edit), a copy itself (`EntityCopy`), what a copy copies
 * (`copyEntityCustomizations*`, `fetchEntityCustomizations`), and the checks a change makes (`hasCharacterPicks`,
 * `lockEntityForMutation`, `wasGeneratedFeat`). Its read side, the view a ruleset's reads see (`withRulesetScope`,
 * `findScopedEntity`), is the cache's (`cache/rulesetCache/`).
 */
export { hasCharacterPicks } from "./characterPicks.ts";
export { ENTITY_REPOS } from "./constants.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copyCustomizations.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { default as EntityCopy } from "./EntityCopy.ts";
export { default as RulesetEdit } from "./RulesetEdit.ts";
export { lockEntityForMutation, wasGeneratedFeat } from "./storedEntities.ts";

export { type EntityType } from "./hashing.ts";
