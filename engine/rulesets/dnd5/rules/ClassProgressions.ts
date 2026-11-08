import { PROFICIENCY_BONUS_BY_LEVEL } from "@/vocabulary/dnd5/classes.ts";

/**
 * The values every class's levels follow, by level from 1, which a class's seed names none of: its Proficiency Bonus,
 * which is the character's, by its level, whatever its classes.
 */
export interface LevelPresets {
  proficiency: number[];
}

/** The progressions a class's levels follow, in the 2024 rules: the Proficiency Bonus alone, the character's. */
export default class ClassProgressions {
  /** The values every class's levels follow, by level: the Proficiency Bonus. */
  static describePresets(): LevelPresets {
    return { proficiency: [...PROFICIENCY_BONUS_BY_LEVEL] };
  }
}
