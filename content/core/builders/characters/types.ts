import type { Alignment, Gender, ItemLocation } from "@/shared/enums.ts";

/** A pick at one of a seeded character's levels (`levelIndex` counts all its levels, from 0). */
type Picks<K extends string> = { levelIndex: number } & Record<K, string>;

/**
 * A seeded character of the seed user's: who it is (its race, abilities and languages by name), its levels (each
 * class's in order, from the first, by the hit points it rolled) and its picks at each, and its inventory.
 */
export interface CharacterSeed {
  abilities: Record<string, number>;
  age: number;
  alignment: Alignment;
  classes: { hp: number[]; klass: string }[];
  description: string;
  feats: (Picks<"featName"> & { aptitude: string })[];
  gender: Gender;
  height: string;
  inventory: InventorySeed[];
  languages: string[];
  name: string;
  powers?: (Picks<"powerName"> & { aptitude: string })[];
  raceName: string;
  skills: { levelIndex: number; rank: number; skillName: string }[];
  weight: string;
  xp: number;
}

/** An item in a seeded character's inventory, by name: how many, and where it's equipped. */
export interface InventorySeed {
  equipped?: boolean;
  location?: ItemLocation;
  name: string;
  quantity: number;
  weaponSet?: number;
}
