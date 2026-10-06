/**
 * Copy-on-write's write side: the rows a change to a ruleset's entities writes (`RulesetEdit`: the ruleset's own, or the
 * copy of an inherited one, made on its first edit), a copy itself (`EntityCopy`), what a copy copies
 * (`copyEntityCustomizations*`, `fetchEntityCustomizations`), each entity type's repository (`ENTITY_REPOS`), and the
 * checks a change makes (`hasCharacterPicks`, `lockEntityForMutation`). Its read side, the view a ruleset's reads see
 * (`withRulesetScope`, `findScopedEntity`), is the cache's (`cache/rulesetCache/`).
 */
export { hasCharacterPicks } from "./characterPicks.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./copyCustomizations.ts";
export { fetchEntityCustomizations } from "./customizations.ts";
export { default as EntityCopy } from "./EntityCopy.ts";
export { ENTITY_REPOS, lockEntityForMutation } from "./entityRepositories.ts";
export { default as RulesetEdit } from "./RulesetEdit.ts";
