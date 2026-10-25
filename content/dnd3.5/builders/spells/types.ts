import type { Property } from "@/content/core/builders/customization/types.ts";

/** A spell: the aptitudes it's in (its spell lists), its saving throw and its properties. */
export interface SpellSeed {
  /** The spell's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  aptitudes: string[];
  description: string;
  name: string;
  properties: Property[];
  savingThrow?: string;
}

/** A spell with its level, as a book files it by level. */
export type LeveledSpellSeed = SpellSeed & { level: number };
