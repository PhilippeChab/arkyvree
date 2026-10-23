/**
 * How a 3.5 character's classes read wherever they're named on one line: its sheet's header and its PDF's first page
 * ("Fighter 3 · Rogue 1"), a card's chips ("Fighter 3").
 */
export default class ClassLevels {
  /** What stands between two classes on a line: "Fighter 3 · Rogue 1" */
  static readonly SEPARATOR = " · ";

  /** A class and the character's level in it: "Fighter 3" */
  static format(className: string, level: number) {
    return `${className} ${level}`;
  }
}
