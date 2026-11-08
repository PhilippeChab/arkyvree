/** The spell lists a feat's text lets its player choose among ("from the Cleric, Druid, or Wizard spell list"). */

/** A choice among classes' spell lists, as a feat's text writes it: the classes. */
const SPELL_LISTS = /from the ((?:[A-Z][a-z]+,? )+or [A-Z][a-z]+) spell list/;

/** The classes whose spell lists `text` lets its player choose among: none for a text that offers no such choice. */
export function readSpellLists(text: string): string[] {
  const lists = SPELL_LISTS.exec(text)?.[1];
  return lists ? lists.split(/,? or |, /).map((name) => name.trim()) : [];
}
