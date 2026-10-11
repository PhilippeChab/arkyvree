/**
 * How a character's classes read wherever they're named on one line: its sheet's header and its PDF's first page
 * ("Fighter 3 · Rogue 1"), a card's chips ("Fighter 3").
 */

/** What stands between two classes on a line: "Fighter 3 · Rogue 1" */
export const CLASS_SEPARATOR = " · ";

/** A class and the character's level in it: "Fighter 3" */
export function formatClassLevel(className: string, level: number) {
  return `${className} ${level}`;
}
