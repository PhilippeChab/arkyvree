/** What a class feature's text counts: the skills its Expertise takes, the kinds of weapons its Weapon Mastery takes. */

import { NUMBER_WORDS } from "@/codegen/dnd5/tools/terms/words.ts";

/**
 * The skills a feature gives Expertise in, by its text: "You gain Expertise in two of your skill proficiencies" (a
 * rogue's), "Choose one of your skill proficiencies with which you lack Expertise" (a ranger's Deft Explorer). None
 * for a feature that gives none, or names the skills it's among (a wizard's Scholar).
 */
const EXPERTISE_PICKS = /(?:Expertise(?: \([^)]*\))? in|Choose) (\w+) of your skill proficiencies/;

/** The kinds of weapons a Weapon Mastery takes, by its text: "the mastery properties of two kinds of weapons". */
const MASTERY_KINDS = /mastery properties of (\w+) kinds/;

/** A number its text writes in words: none for another word. */
function readNumberWord(word: string): number | undefined {
  return NUMBER_WORDS[word.toLowerCase()];
}

/** The skills a feature's text gives Expertise in at once (`EXPERTISE_PICKS`): none for a feature that gives none. */
export function readExpertisePicks(text: string): number | undefined {
  const match = EXPERTISE_PICKS.exec(text);
  return match ? readNumberWord(match[1]) : undefined;
}

/** The kinds of weapons a Weapon Mastery's text takes at first (`MASTERY_KINDS`): none for a text that names none. */
export function readMasteryKinds(text: string): number | undefined {
  const match = MASTERY_KINDS.exec(text);
  return match ? readNumberWord(match[1]) : undefined;
}
