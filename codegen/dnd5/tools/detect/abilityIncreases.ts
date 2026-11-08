/** An ability score increase a feat's text gives: the abilities it's taken in, and by how much. */

import { ABILITY_NAMES } from "@/vocabulary/dnd5/abilities.ts";

/** An ability score increase: the abilities one is picked among, each a variant of its feat, and its amount. */
export interface AbilityIncrease {
  abilities: string[];
  amount: number;
}

/** An increase of one ability of the player's choice ("Increase one ability score of your choice by 1"). */
const ANY_ABILITY = /Increase one ability score of your choice by (\d+)/;

/** An increase of one of a few abilities ("Increase your Intelligence, Wisdom, or Charisma score by 1"). */
const NAMED_ABILITIES = /Increase your ((?:[A-Z][a-z]+,? )+or [A-Z][a-z]+) score by (\d+)/;

/**
 * The ability score increase `text` gives, its abilities and its amount: one of the player's choice is any of the six
 * (Boon of Fate's), else the ones it names (Grappler's Strength or Dexterity). None for a text without one.
 */
export function readAbilityIncrease(text: string): AbilityIncrease | undefined {
  const any = ANY_ABILITY.exec(text);
  if (any) return { abilities: [...ABILITY_NAMES], amount: Number(any[1]) };
  const named = NAMED_ABILITIES.exec(text);
  if (!named) return undefined;
  const abilities = named[1].split(/,? or |, /).map((name) => name.trim());
  const unknown = abilities.filter((ability) => !ABILITY_NAMES.includes(ability));
  if (unknown.length > 0) throw new Error(`An ability score increase names no ability: ${unknown.join(", ")}`);
  return { abilities, amount: Number(named[2]) };
}
