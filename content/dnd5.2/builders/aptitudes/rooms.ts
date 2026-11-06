/**
 * A pool's rooms, as the content gives them: picks in a pool of feats (`aptitudes.<pool>.allowed`), and spells at a
 * spell level of a list (`aptitudes.<list>.<level>.allowed`).
 */

import { bonus } from "@/content/core/builders/customization/modifiers.ts";
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
