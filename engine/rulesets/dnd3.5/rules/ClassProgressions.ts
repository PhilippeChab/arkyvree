import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import { BAB_PROGRESSIONS, type BabType, SAVE_PROGRESSIONS, type SaveType } from "@/vocabulary/dnd3.5/classes.ts";

/**
 * Each of a class's progressions, by how good it is, its value at each class level from the first to the last: its
 * base attack bonus's and its saves'.
 */
export interface LevelPresets {
  bab: Record<BabType, number[]>;
  saves: Record<SaveType, number[]>;
}

/** A class's levels, from the first to the last, as a preset's values go. */
const CLASS_LEVELS = Array.from({ length: RULESET_LIMITS.classLevel }, (_, index) => index + 1);

/**
 * A class's base attack bonus and base saves at a level, by how good its progression is (3.5's tables): what its
 * level form's presets fill, a bonded creature's by its hit dice, and the seeded classes' levels read.
 */
export default class ClassProgressions {
  /** Each progression's (`progressions`, by its key) value at each class level, as `valueAt` gives it. */
  private static valuesByLevel<K extends string>(
    progressions: Record<K, unknown>,
    valueAt: (progression: K, level: number) => number,
  ): Record<K, number[]> {
    const keys = Object.keys(progressions) as K[];
    const values = keys.map((key) => [key, CLASS_LEVELS.map((level) => valueAt(key, level))]);
    return Object.fromEntries(values) as Record<K, number[]>;
  }

  /** The base attack bonus at `level`, by `progression` (good: the level; medium: three quarters; poor: half). */
  static babAt(progression: BabType, level: number): number {
    const { levels, points } = BAB_PROGRESSIONS[progression];
    return Math.floor((level * points) / levels);
  }

  /**
   * Each progression's value at each class level, by how good it is, in the vocabulary's order (good first): what a
   * class's level form's presets fill, and its content's seeded levels store.
   */
  static describePresets(): LevelPresets {
    return {
      bab: ClassProgressions.valuesByLevel(BAB_PROGRESSIONS, ClassProgressions.babAt),
      saves: ClassProgressions.valuesByLevel(SAVE_PROGRESSIONS, ClassProgressions.saveAt),
    };
  }

  /** The base save at `level` (or hit dice), by `progression` (good: 2 + half; poor: a third). */
  static saveAt(progression: SaveType, level: number): number {
    const { base, hitDicePerPoint } = SAVE_PROGRESSIONS[progression];
    return base + Math.floor(level / hitDicePerPoint);
  }
}
