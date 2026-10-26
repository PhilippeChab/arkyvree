import type { ItemLocation } from "@/vocabulary/dnd3.5/equipment.ts";
import {
  type CHARACTER_AGE,
  type CHARACTER_ALIGNMENT,
  type CHARACTER_DEITY,
  type CHARACTER_GENDER,
  type CHARACTER_HEIGHT,
  type CHARACTER_WEIGHT,
  type CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import type { Alignment, Gender } from "@/vocabulary/dnd3.5/identity.ts";

/** A pick at one of a seeded character's levels (`levelIndex` counts all its levels, from 0). */
type Picks<K extends string> = { levelIndex: number } & Record<K, string>;

/** A seeded character's fields, as stored, by field: its identity and its experience. */
export interface CharacterFields {
  [CHARACTER_AGE]?: number;
  [CHARACTER_ALIGNMENT]: Alignment;
  [CHARACTER_DEITY]?: string;
  [CHARACTER_GENDER]: Gender;
  [CHARACTER_HEIGHT]?: string;
  [CHARACTER_WEIGHT]?: string;
  [CHARACTER_XP]: number;
}

/**
 * A seeded character of the seed user's: who it is (its fields as stored, its race, by its name, its `race` link, and
 * its abilities and languages by name), its levels (each class's in order, from the first, by the hit points it
 * rolled) and its picks at each, and its inventory.
 */
export interface CharacterSeed {
  abilities: Record<string, number>;
  classes: { hp: number[]; klass: string }[];
  description: string;
  feats: (Picks<"featName"> & { aptitude: string })[];
  fields: CharacterFields;
  inventory: InventorySeed[];
  languages: string[];
  links: { race: string };
  name: string;
  skills: { levelIndex: number; rank: number; skillName: string }[];
  spells?: (Picks<"spellName"> & { aptitude: string })[];
}

/** An item in a seeded character's inventory, by name: how many, and where it's equipped. */
export interface InventorySeed {
  equipped?: boolean;
  /** The groups it's held in (3.5's weapon sets a hand holds it in), from 0 */
  groups?: number[];
  location?: ItemLocation;
  name: string;
  quantity: number;
}
