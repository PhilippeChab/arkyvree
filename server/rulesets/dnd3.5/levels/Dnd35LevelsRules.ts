import type { LevelsRules } from "@/server/rulesets/engine/module/index.ts";

export class Dnd35LevelsRules implements LevelsRules {
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
