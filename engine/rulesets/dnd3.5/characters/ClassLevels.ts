/**
 * A 3.5 character's level in each class, and how its classes read wherever they're named on one line: its sheet's
 * header and its PDF's first page ("Fighter 3 · Rogue 1"), a card's chips ("Fighter 3").
 */
export default class ClassLevels {
  /** What stands between two classes on a line: "Fighter 3 · Rogue 1" */
  static readonly SEPARATOR = " · ";

  /**
   * The character's level in each class it has levels of, by the class's id: its levels (`levels`, its advancements,
   * each with its entry, a class level of `classLevelsById`) of the class, counted, whatever their class levels'
   * positions, as the model counts `classes.<class>.level`; a class's next level follows it
   * (`LevelRules.findNextClassLevel`). A level whose class level the view doesn't have counts in no class.
   */
  static countByClass(
    classLevelsById: ReadonlyMap<string, { ownerId: string }>,
    levels: { entryId: string | null }[],
  ): Map<string, number> {
    const levelByClass = new Map<string, number>();
    for (const { entryId } of levels) {
      const classId = entryId === null ? undefined : classLevelsById.get(entryId)?.ownerId;
      if (classId) levelByClass.set(classId, (levelByClass.get(classId) ?? 0) + 1);
    }
    return levelByClass;
  }

  /** A class and the character's level in it: "Fighter 3" */
  static format(className: string, level: number) {
    return `${className} ${level}`;
  }
}
