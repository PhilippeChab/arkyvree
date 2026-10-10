import type { Property } from "@/content/core/builders/customization/types.ts";

/** A power: the aptitudes it's in (its spell lists), its saving throw and its properties. */
export interface PowerSeed {
  /** The power's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  aptitudes: string[];
  description: string;
  name: string;
  properties: Property[];
  savingThrow?: string;
}

/** A spell: a power with its level. */
export type SpellSeed = PowerSeed & { level: number };
