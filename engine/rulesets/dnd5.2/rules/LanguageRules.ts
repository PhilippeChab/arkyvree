import { LANGUAGE_PICKS, RARE_LANGUAGE_TYPE } from "@/vocabulary/dnd5.2/languages.ts";

/**
 * The languages' rules, as the ruleset reads them: past the languages its modifiers grant it (Common, a druid's
 * Druidic, a rogue's Thieves' Cant), a character picks two standard languages (`LANGUAGE_PICKS`), and one more per
 * extra pick its modifiers add; no pick takes a rare one, which only a feature grants.
 */
export default class LanguageRules {
  /** Whether a language's type makes it rare (`RARE_LANGUAGE_TYPE`, however a ruleset cases it: "rare"). */
  static isRare(type: string): boolean {
    return type.toLowerCase() === RARE_LANGUAGE_TYPE.toLowerCase();
  }

  /** How many languages a character picks: two, and one per extra pick its modifiers add (`extraPicks`), none below 0. */
  static roomOf(extraPicks: number): number {
    return Math.max(0, LANGUAGE_PICKS + extraPicks);
  }
}
