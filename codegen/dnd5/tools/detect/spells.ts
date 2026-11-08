/** What a spell's entry says past its fields: its components by name, and the saving throw its text calls for. */

import { SAVE_NAMES } from "@/vocabulary/dnd5/saves.ts";
import { SPELL_COMPONENTS } from "@/vocabulary/dnd5/spells.ts";

/** A spell's component, as the vocabulary names it. */
export type SpellComponent = (typeof SPELL_COMPONENTS)[number];

/** The first saving throw a spell's text names ("makes a Dexterity saving throw"): its save. */
const SAVING_THROW = new RegExp(`\\b(${SAVE_NAMES.join("|")}) saving throw`);

/** A spell's components by name, from the letters the database writes them with ("V", "S", "M"): an unknown throws. */
export function readComponents(letters: readonly string[]): SpellComponent[] {
  return letters.map((letter) => {
    const component = SPELL_COMPONENTS.find((name) => name.startsWith(letter.toUpperCase()));
    if (!component) throw new Error(`"${letter}" names no spell component`);
    return component;
  });
}

/** The saving throw a spell's text calls for first, by its save's name: none for a spell that calls for none. */
export function readSpellSave(description: string): string | undefined {
  return SAVING_THROW.exec(description)?.[1];
}
