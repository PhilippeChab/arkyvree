/**
 * Copy-on-write, the server's part: storage and concurrency, around the model the engine computes.
 *
 * - Its read side (`views/`): the rulesets' cache (`RulesetViews`: each ruleset's copy-on-write data, its own rows and
 *   its target paths, and the view composed from them), what it reads them with (`CowDataReader`, `RawDataReader`), and
 *   the scope a service reads a view in (`withRulesetScope`).
 * - Its write side (`writes/`): the row a write to an entity changes, an owned one's on its owner's (`EntityEdit`), and
 *   what a write asks of it: a copy's token, its owned entities and its customizations' rows (`EditTarget`); the row a
 *   change to a customization writes (`CustomizationEdit`), the names an entity may take (`EntityNames`), what keeps an
 *   entity in use across the rulesets built on it (`EntityUses`), the copy of an inherited entity (`EntityCopy`) and its
 *   revert to the source (`EntityRevert`), and an entity's customizations read and copied (`CustomizationCopies`).
 */
export { default as CowDataReader } from "./views/CowDataReader.ts";
export { default as RulesetViews } from "./views/RulesetViews.ts";
export { type RulesetScope, withRulesetScope, withRulesetScopes } from "./views/scope.ts";
export { default as CustomizationCopies } from "./writes/CustomizationCopies.ts";
export { default as CustomizationEdit } from "./writes/CustomizationEdit.ts";
export { type default as EditTarget } from "./writes/EditTarget.ts";
export { default as EntityCopy } from "./writes/EntityCopy.ts";
export { default as EntityEdit, type NotFoundMessages } from "./writes/EntityEdit.ts";
export { default as EntityNames } from "./writes/EntityNames.ts";
export { default as EntityRevert } from "./writes/EntityRevert.ts";
export { default as EntityUses } from "./writes/EntityUses.ts";
