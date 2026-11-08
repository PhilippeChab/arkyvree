/**
 * A pool's rooms, as the content gives them: picks in a pool of feats (`aptitudes.<pool>.allowed`), spells at a spell
 * level of a list (`aptitudes.<list>.<level>.allowed`), and spell slots at a spell level of a list
 * (`aptitudes.<list>.<level>.uses`).
 */

import { bonus, setNum } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** `picks` more picks in the pool of feats `pool` ("Fighting Style"). */
export function poolRoom(pool: string, picks: number): Modifier {
  return bonus(`aptitudes.${stripSeparators(pool)}.allowed`, picks);
}

/** `spells` more spells of the spell level `level` (0 for cantrips) in the spell list `list` ("Wizard Spells"). */
export function spellRoom(list: string, level: number, spells: number): Modifier {
  return bonus(`aptitudes.${stripSeparators(list)}.${level}.allowed`, spells);
}

/**
 * Every spell of the spell level `level` on the spell list `list` known ("Cleric Spells"): a class that prepares from its
 * whole list, a cleric's, as a Pathfinder cleric knows every spell of a level it can cast.
 */
export function spellsAllKnown(list: string, level: number): Modifier {
  return setNum(`aptitudes.${stripSeparators(list)}.${level}.allowed`, -1);
}

/** `slots` more spell slots of the spell level `level` on the spell list `list` ("Wizard Spells"). */
export function spellSlots(list: string, level: number, slots: number): Modifier {
  return bonus(`aptitudes.${stripSeparators(list)}.${level}.uses`, slots);
}
