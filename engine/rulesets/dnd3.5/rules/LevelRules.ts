import { stripSeparators } from "@/shared/text.ts";
import { ABILITY_INCREASE_LEVEL_INTERVAL, GENERAL_FEAT_LEVEL_INTERVAL } from "@/vocabulary/dnd3.5/classes.ts";
import { GENERAL_FEATS_APTITUDE } from "@/vocabulary/dnd3.5/feats.ts";

export default class LevelRules {
  /**
   * The slug of the aptitude the general feats count toward (`GENERAL_FEATS_APTITUDE`): what the engine, the target
   * paths (`aptitudes.general.*`) and the effects know it by.
   */
  static readonly GENERAL_FEATS_APTITUDE_SLUG = stripSeparators(GENERAL_FEATS_APTITUDE);
  /** The hit points a level counts before they're rolled: a level a level-up adds, whose hit points its save sets. */
  static readonly UNROLLED_LEVEL_HP = 10;

  /**
   * The feats a level or hit die count gives: one at the first, and one more every third
   * (`GENERAL_FEAT_LEVEL_INTERVAL`). A character's general feats at its total level, and a creature's feats at its hit
   * dice (the Monster Manual's).
   */
  static countGeneralFeats(totalLevel: number): number {
    return totalLevel === 0 ? 0 : Math.floor(totalLevel / GENERAL_FEAT_LEVEL_INTERVAL) + 1;
  }

  /** Whether the level after `totalLevel` levels takes an ability increase: every fourth (`ABILITY_INCREASE_LEVEL_INTERVAL`). */
  static isAbilityIncreaseLevel(totalLevel: number): boolean {
    return (totalLevel + 1) % ABILITY_INCREASE_LEVEL_INTERVAL === 0;
  }
}
