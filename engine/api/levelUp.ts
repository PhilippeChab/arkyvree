import type { RulesetView } from "@/engine/core/types.ts";

import { getRulesetModule } from "./modules.ts";

/** An operation's arguments after the view, which picks the ruleset. */
type After<F> = F extends (view: RulesetView, ...rest: infer R) => unknown ? R : never;

/** The ruleset's level-up: what its module answers. */
type LevelUp = ReturnType<typeof getRulesetModule>["levelUp"];

/** The ruleset's level-up. */
function levelUpOf(view: RulesetView): LevelUp {
  return getRulesetModule(view.ruleset.baseRules).levelUp;
}

/** Refuses a character that fails its rules, from its rows: what it fails, as the refusal's issues. */
export function checkCharacter(view: RulesetView, ...args: After<LevelUp["checkCharacter"]>) {
  levelUpOf(view).checkCharacter(view, ...args);
}

/** A saved level's selections, as its edit opens them. */
export function describeLevel(view: RulesetView, ...args: After<LevelUp["describeLevel"]>) {
  return levelUpOf(view).describeLevel(view, ...args);
}

/** The level-up wizard's attributes step. */
export function getAttributeSlots(view: RulesetView, ...args: After<LevelUp["getAttributeSlots"]>) {
  return levelUpOf(view).getAttributeSlots(view, ...args);
}

/** The level-up wizard's feats step. */
export function getFeatSlots(view: RulesetView, ...args: After<LevelUp["getFeatSlots"]>) {
  return levelUpOf(view).getFeatSlots(view, ...args);
}

/** The level-up wizard's preview of the levels the character plans. */
export function getLevelUpPreview(view: RulesetView, ...args: After<LevelUp["getLevelUpPreview"]>) {
  return levelUpOf(view).getLevelUpPreview(view, ...args);
}

/** The level-up wizard's powers step. */
export function getPowerSlots(view: RulesetView, ...args: After<LevelUp["getPowerSlots"]>) {
  return levelUpOf(view).getPowerSlots(view, ...args);
}

/** The level-up wizard's skills step. */
export function getSkillSlots(view: RulesetView, ...args: After<LevelUp["getSkillSlots"]>) {
  return levelUpOf(view).getSkillSlots(view, ...args);
}

/** The class picker for a page of classes: whether it needs the character, and the options described. */
export function openClassPicker(view: RulesetView, ...args: After<LevelUp["openClassPicker"]>) {
  return levelUpOf(view).openClassPicker(view, ...args);
}

/** A feat picker for the character: what it offers and leaves out, and a page of options annotated. */
export function openFeatPicker(view: RulesetView, ...args: After<LevelUp["openFeatPicker"]>) {
  return levelUpOf(view).openFeatPicker(view, ...args);
}

/** A power picker for the character: what it offers and leaves out, and a page of options annotated. */
export function openPowerPicker(view: RulesetView, ...args: After<LevelUp["openPowerPicker"]>) {
  return levelUpOf(view).openPowerPicker(view, ...args);
}

/** What a master's bonded creatures become as its levels make them, from its rows and theirs. */
export function planBondedCreatures(view: RulesetView, ...args: After<LevelUp["planBondedCreatures"]>) {
  return levelUpOf(view).planBondedCreatures(view, ...args);
}

/** A saved level's edit: what it writes, checked, and what the master's bonded creatures become with it. */
export function planLevelEdit(view: RulesetView, ...args: After<LevelUp["planLevelEdit"]>) {
  return levelUpOf(view).planLevelEdit(view, ...args);
}

/** The levels a level-up saves, checked, with the picks spread over them: the rows the save writes. */
export function planLevelUp(view: RulesetView, ...args: After<LevelUp["planLevelUp"]>) {
  return levelUpOf(view).planLevelUp(view, ...args);
}
