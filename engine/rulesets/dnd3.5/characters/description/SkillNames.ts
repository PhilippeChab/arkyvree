/**
 * A 3.5 skill's name as a sheet groups it: the family the words before its brackets name ("Knowledge (arcana)" is a
 * Knowledge), and its name within that family ("arcana").
 */
export default class SkillNames {
  /**
   * A skill's family (none for a name without brackets) and its name within it: what follows the family, its brackets
   * dropped when they hold all of it and nothing bracketed ("arcana", but "(lore (elves))").
   */
  static describe(name: string): { family: string | null; shortName: string } {
    const family = /^(.+?)\s*\(/.exec(name)?.[1] ?? null;
    if (family === null) return { family, shortName: name };
    const rest = name.replace(/^.+?\s*\(/, "(");
    return { family, shortName: rest.replace(/^\(([^()]*)\)$/, "$1") };
  }
}
