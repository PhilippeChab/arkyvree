import type { LevelsRules } from "@/server/rulesets/engine/module/index.ts";
import { stripSeparators } from "@/shared/text.ts";

export class Dnd35LevelsRules implements LevelsRules {
  /** The aptitude the general feats count toward, by its name, which a ruleset keeps (`Dnd35AptitudesRules`). */
  static readonly GENERAL_FEATS_APTITUDE = "General";
  /** Its slug: what the engine, the target paths (`aptitudes.general.*`) and the effects know it by. */
  static readonly GENERAL_FEATS_APTITUDE_SLUG = stripSeparators(Dnd35LevelsRules.GENERAL_FEATS_APTITUDE);

  /** The highest spell level: a static, for the code that reads it without the ruleset's module. */
  static readonly MAX_SPELL_LEVEL = 9;

  /**
   * The feats a level or hit die count gives: one at the first, and one more every third. A character's general feats
   * at its total level, and a creature's feats at its hit dice (the Monster Manual's).
   */
  static countGeneralFeats(totalLevel: number): number {
    return totalLevel === 0 ? 0 : Math.floor(totalLevel / 3) + 1;
  }

  isAbilityIncreaseLevel(totalLevel: number): boolean {
    return (totalLevel + 1) % 4 === 0;
  }
}
