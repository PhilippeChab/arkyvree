import { SECRET_LANGUAGE_TYPE } from "@/vocabulary/dnd3.5/languages.ts";

/**
 * The 3.5 languages' rules, as the ruleset reads them: past the languages its modifiers grant it (a race's automatic
 * languages, a druid's Druidic), a character picks any language but a secret one, a pick per point of its permanent
 * Intelligence modifier, per whole Speak Language rank, and per extra pick its modifiers add. No race or class lists
 * the languages it picks from: the SRD's bonus languages are left out on purpose.
 */
export default class LanguageRules {
  /** Whether a language's type keeps it secret (`SECRET_LANGUAGE_TYPE`, however a ruleset cases it: "secret"). */
  static isSecret(type: string): boolean {
    return type.toLowerCase() === SECRET_LANGUAGE_TYPE.toLowerCase();
  }

  /**
   * How many languages a character picks: a pick per point of its permanent Intelligence modifier
   * (`intelligenceModifier`, none below 0), per whole rank it has in Speak Language (`ranks`: a cross-class skill's
   * half rank adds none), and per extra pick its modifiers add (`extraPicks`), none below 0.
   */
  static roomOf(intelligenceModifier: number, ranks: number, extraPicks: number): number {
    return Math.max(0, Math.max(0, intelligenceModifier) + Math.floor(ranks) + extraPicks);
  }
}
