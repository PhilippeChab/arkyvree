/**
 * Copy-on-write, the server's part: storage and concurrency, around the model the engine computes.
 *
 * - Its read side (`views/`): a ruleset's view, read and memoized (`RulesetViews`: its rows, its copy-on-write data,
 *   their composition, its target paths), and the scope a ruleset's reads run in (`withRulesetScope`).
 * - Its write side (`writes/`): the rows a change to a ruleset's entities writes (`RulesetEdit`: the ruleset's own, or
 *   the copy of an inherited one, made on its first edit), a copy itself (`EntityCopy`), what a copy copies
 *   (`copyEntityCustomizations*`, `fetchEntityCustomizations`), each entity type's repository (`ENTITY_REPOS`), and the
 *   checks a change makes (`hasCharacterPicks`, `lockEntityForMutation`).
 */
export { readCowData } from "./views/cowData.ts";
export { default as RulesetViews } from "./views/RulesetViews.ts";
export { type RulesetScope, withRulesetScope, withRulesetScopes } from "./views/scope.ts";
export { readTargetPathCatalogs, readTargetPaths } from "./views/targetPaths.ts";
export { hasCharacterPicks } from "./writes/characterPicks.ts";
export { copyEntityCustomizations, copyEntityCustomizationsToMany } from "./writes/copyCustomizations.ts";
export { fetchEntityCustomizations } from "./writes/customizations.ts";
export { default as EntityCopy } from "./writes/EntityCopy.ts";
export { ENTITY_REPOS, lockEntityForMutation } from "./writes/entityRepositories.ts";
export { default as RulesetEdit } from "./writes/RulesetEdit.ts";
