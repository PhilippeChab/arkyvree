/**
 * Copy-on-write, the server's part: storage and concurrency, around the model the engine computes.
 *
 * - Its read side (`views/`): the rulesets' cache (`RulesetViews`: each ruleset's copy-on-write data, its own rows and
 *   its target paths, and the view composed from them), what it reads them with (`CowDataReader`, `RawDataReader`), and
 *   the scope a service reads a view in (`withRulesetScope`).
 * - Its write side (`writes/`): the row a change to an entity writes (`EntityEdit`), the row a change to a
 *   customization writes (`CustomizationEdit`), the names an entity may take (`EntityNames`), the copy of an
 *   inherited entity (`EntityCopy`) and its revert to the source (`EntityRevert`), an entity's customizations read and
 *   copied (`CustomizationCopies`), and each entity type's repository (`EntityRepositories`).
 */
export { default as CowDataReader } from "./views/CowDataReader.ts";
export { default as RulesetViews } from "./views/RulesetViews.ts";
export { type RulesetScope, withRulesetScope, withRulesetScopes } from "./views/scope.ts";
export { default as CustomizationCopies } from "./writes/CustomizationCopies.ts";
export { default as CustomizationEdit } from "./writes/CustomizationEdit.ts";
export { default as EntityCopy } from "./writes/EntityCopy.ts";
export { default as EntityEdit } from "./writes/EntityEdit.ts";
export { default as EntityNames } from "./writes/EntityNames.ts";
export { default as EntityRepositories } from "./writes/EntityRepositories.ts";
export { default as EntityRevert } from "./writes/EntityRevert.ts";
