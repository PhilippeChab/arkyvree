import type { Property } from "@/database/packages/dnd35/content/customization/types.ts";

/** A power: the aptitudes it's in (its spell lists), its saving throw and its properties. */
export type PowerSeed = {
  name: string;
  description: string;
  aptitudes: string[];
  /** The power's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  savingThrow?: string;
  properties: Property[];
};

/** A spell: a power with its level. */
export type SpellSeed = PowerSeed & { level: number };
