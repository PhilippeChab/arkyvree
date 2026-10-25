import type { PartialFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A spell: the aptitudes it's in (its spell lists), its saving throw and its fields (its stat block's). */
export interface SpellSeed {
  /** The spell's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  aptitudes: string[];
  description: string;
  fields: SpellFields;
  name: string;
  savingThrow?: string;
}

/** A spell with its level, as a book files it by level. */
export type LeveledSpellSeed = SpellSeed & { level: number };

/** A spell's fields a seed gives: some of those 3.5 declares a spell's (`ENTITY_FIELDS.spells`), each of its kind. */
export type SpellFields = PartialFieldValues<typeof ENTITY_FIELDS.spells>;
