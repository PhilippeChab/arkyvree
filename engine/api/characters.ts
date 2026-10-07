import type { RulesetView } from "@/engine/core/types.ts";

import { type After, getRulesetModule } from "./modules.ts";

/** The ruleset's characters: what its module answers of them. */
type Characters = ReturnType<typeof getRulesetModule>["characters"];

/** The ruleset's characters. */
function charactersOf(view: RulesetView): Characters {
  return getRulesetModule(view.ruleset.baseRules).characters;
}

/**
 * Refuses equipping an inventory entry's item at a location, from the character's rows: a slot that can't take it, or
 * requirements the character doesn't meet unless forced.
 */
export function checkEquipping(view: RulesetView, ...args: After<Characters["checkEquipping"]>) {
  charactersOf(view).checkEquipping(view, ...args);
}

/**
 * A character's sheet, as the API answers it, from its rows: a player character's with its bonded creatures', their
 * private notes as the viewer reads them (all of them, blank, or no field); or a bonded creature's, from its master's.
 */
export function describeCharacter(view: RulesetView, ...args: After<Characters["describeCharacter"]>) {
  return charactersOf(view).describeCharacter(view, ...args);
}

/** A character's printed sheet, from its rows: the PDF document the server renders. */
export function describeCharacterSheet(view: RulesetView, ...args: After<Characters["describeCharacterSheet"]>) {
  return charactersOf(view).describeCharacterSheet(view, ...args);
}

/** What a campaign member who sees a character only partly reads of it: who it is, and its identity. */
export function describePartialCharacter(view: RulesetView, ...args: After<Characters["describePartialCharacter"]>) {
  return charactersOf(view).describePartialCharacter(view, ...args);
}

/** The race picker for a new character of what its form says: each race of a page, with whether it can pick it. */
export function openRacePicker(view: RulesetView, ...args: After<Characters["openRacePicker"]>) {
  return charactersOf(view).openRacePicker(view, ...args);
}
