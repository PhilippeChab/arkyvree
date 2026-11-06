/**
 * What the species' traits give past their text: the modifiers of the traits a sheet reads a number of (a dwarf's
 * hit points) or that give a pick (a human's Origin feat). A trait none names, and no choice of skills makes a pick of,
 * is its text alone (a darkvision's range, a resistance).
 */

import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { ModifierSeed } from "@/content/core/builders/customization/types.ts";
import { poolRoom } from "@/content/dnd5.2/builders/aptitudes/rooms.ts";

/** The modifiers of the traits a sheet reads a number of, or that give a pick, by trait. */
export const TRAIT_MODIFIERS: Readonly<Record<string, ModifierSeed[]>> = {
  "Dwarven Toughness": [bonus("combat.hp.misc", "{{ [identity.meta.level] }}")],
  Versatile: [poolRoom("Origin", 1)],
};
