import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import { RULESET_FIELDS, type RulesetFieldValues } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import { countProgressionAt } from "@/shared/customization/progression.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MAX_CHARACTER_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { GENERAL_FEATS_APTITUDE } from "@/vocabulary/dnd3.5/feats.ts";

/** What a character's levels give it whatever its classes, by its ruleset's Settings: its feats and its increases. */
type Progression = Pick<RulesetFieldValues, "abilityIncreases" | "featAdvancement">;

/**
 * What a character's levels give it whatever its classes, as its ruleset's Settings have it (`of`): the feats it picks
 * and the ability increases it takes at each character level; and the bounds every ruleset's levels keep.
 */
export default class LevelRules {
  constructor(private readonly progression: Progression) {}

  /**
   * The slug of the aptitude the general feats count toward (`GENERAL_FEATS_APTITUDE`): what the engine, the target
   * paths (`aptitudes.general.*`) and the effects know it by.
   */
  static readonly GENERAL_FEATS_APTITUDE_SLUG = stripSeparators(GENERAL_FEATS_APTITUDE);
  /** The hit points a level counts before they're rolled: a level a level-up adds, whose hit points its save sets. */
  static readonly UNROLLED_LEVEL_HP = 10;

  /**
   * The levels a character with `totalLevel` levels can still take, whatever their classes: up to a character's last
   * level (`MAX_CHARACTER_LEVEL`).
   */
  static countLevelsLeft(totalLevel: number): number {
    return Math.max(0, MAX_CHARACTER_LEVEL - totalLevel);
  }

  /**
   * The level rules of a ruleset's view, off its Settings (`RULESET_FIELDS`): the nearest ruleset of its chain's that
   * holds them, the fork's first, the core rules' when none does.
   */
  static of({ ruleset, rulesetData }: RulesetView): LevelRules {
    return new LevelRules(RULESET_FIELDS.read(rulesetData.rulesetPropertiesOf(ruleset.id)));
  }

  /**
   * A character's highest level in each class it has levels of (`levels`, its levels' rows), by the class's id: its
   * next level in a class is the one after.
   */
  static readMaxKlassLevels(rulesetData: RulesetData, levels: { klassLevelId: string }[]): Map<string, number> {
    const maxLevels = new Map<string, number>();
    for (const level of levels) {
      const klassLevel = rulesetData.klassLevelsById.get(level.klassLevelId);
      if (klassLevel)
        maxLevels.set(klassLevel.klassId, Math.max(maxLevels.get(klassLevel.klassId) ?? 0, klassLevel.level));
    }
    return maxLevels;
  }

  /** The ability increases the level after `totalLevel` levels takes, by its Settings (`abilityIncreases`). */
  countAbilityIncreases(totalLevel: number): number {
    return countProgressionAt(this.progression.abilityIncreases, totalLevel + 1);
  }

  /**
   * The general feats a character has at its total level: those its levels up to it give, by its Settings
   * (`featAdvancement`): its frequency's, past the last level too, and the more its levels give.
   */
  countGeneralFeats(totalLevel: number): number {
    const { every, extra } = this.progression.featAdvancement;
    const regular = every > 0 ? Math.floor(totalLevel / every) : 0;
    return regular + extra.filter(({ level }) => level <= totalLevel).reduce((sum, { amount }) => sum + amount, 0);
  }

  /** The general feats the level after `totalLevel` levels gives, by its Settings (`featAdvancement`). */
  countGeneralFeatsAfter(totalLevel: number): number {
    return countProgressionAt(this.progression.featAdvancement, totalLevel + 1);
  }

  /** Whether the level after `totalLevel` levels takes an ability increase. */
  isAbilityIncreaseLevel(totalLevel: number): boolean {
    return this.countAbilityIncreases(totalLevel) > 0;
  }
}
