import { MAX_CHARACTER_LEVEL } from "@/vocabulary/dnd5/classes.ts";

/** A ruleset's class levels by id, as the next-level rule reads them: each its class and its number in it. */
type ClassLevelsById = ReadonlyMap<string, { ownerId: string; position: number }>;
/**
 * The rules a character's levels keep whatever its classes: the levels it has left, and the next level of a class
 * (its lowest the character doesn't hold). The 2024 rules give no feat or ability increase by character level: a
 * class's levels give them.
 */
export default class LevelRules {
  /** The hit points a level counts before they're rolled: a level a level-up adds, whose hit points its save sets. */
  static readonly UNROLLED_LEVEL_HP = 10;

  static countLevelsLeft(totalLevel: number): number {
    return Math.max(0, MAX_CHARACTER_LEVEL - totalLevel);
  }

  /**
   * The numbers of class `classId`'s levels a character with `levels` holds (its advancements, each with its entry, a
   * class level of `classLevelsById`, by any id the view keys it by).
   */
  static findHeldClassLevels(
    classLevelsById: ClassLevelsById,
    levels: { entryId: string }[],
    classId: string,
  ): Set<number> {
    return new Set(
      levels.flatMap(({ entryId }) => {
        const classLevel = classLevelsById.get(entryId);
        return classLevel?.ownerId === classId ? [classLevel.position] : [];
      }),
    );
  }

  /**
   * The number of class `classId`'s next level for a character with `levels` (its advancements, each with its entry, a
   * class level of `classLevelsById`): its lowest the character doesn't hold (`findHeldClassLevels`). A class's levels
   * come one after another, so it's one past the character's levels of the class, or, for a character a level forced
   * past a class's order left a gap before the rule (a lone Fighter 3), the level it skipped, which fills the gap
   * (Fighter 1, Fighter 2, then Fighter 4). What the class picker offers, and the only class level a level-up's save or
   * an import takes; past a class's last level, a number the class has no level at.
   */
  static findNextClassLevel(classLevelsById: ClassLevelsById, levels: { entryId: string }[], classId: string): number {
    const held = this.findHeldClassLevels(classLevelsById, levels, classId);
    let next = 1;
    while (held.has(next)) next++;
    return next;
  }

  /** Whether class level `classLevel` is its class's next for a character with `levels` (`findNextClassLevel`). */
  static isNextClassLevel(
    classLevelsById: ClassLevelsById,
    levels: { entryId: string }[],
    classLevel: { ownerId: string; position: number },
  ): boolean {
    return this.findNextClassLevel(classLevelsById, levels, classLevel.ownerId) === classLevel.position;
  }

  /**
   * The class levels a plan's levels take, in order (`classIds`, each planned level's class, after the character's
   * `levels`): each its class's next (`findNextClassLevel`) after the character's levels and the plan's before it, a gap
   * filled first (a lone Fighter 3 planning three Fighter levels takes Fighter 1, 2 and 4); past a class's last, a
   * number the class has no level at.
   */
  static numberPlannedLevels(classLevelsById: ClassLevelsById, levels: { entryId: string }[], classIds: string[]) {
    const heldByClass = new Map<string, Set<number>>();
    return classIds.map((classId) => {
      const held = heldByClass.get(classId) ?? this.findHeldClassLevels(classLevelsById, levels, classId);
      heldByClass.set(classId, held);
      let next = 1;
      while (held.has(next)) next++;
      held.add(next);
      return next;
    });
  }
}
