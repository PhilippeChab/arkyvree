import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A spell's single links: the save that resists it (`resistedBy`), by its name. */
export interface SpellLinks {
  resistedBy?: string;
}

/**
 * A spell: the aptitudes it's in (its spell lists), its fields as stored (its stat block's, what a successful save
 * does) and the save that resists it (its `resistedBy` link), by its name.
 */
export interface SpellSeed {
  /** The spell's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  aptitudes: string[];
  description: string;
  fields: SpellFields;
  links?: SpellLinks;
  name: string;
}

/** A spell with its level, as a book files it by level. */
export type LeveledSpellSeed = SpellSeed & { level: number };

/**
 * A spell's fields a seed gives, as stored: some of those 3.5 declares a spell's (`ENTITY_FIELDS.spells`), by stored
 * field, each of its kind.
 */
export type SpellFields = StoredFieldValues<typeof ENTITY_FIELDS.spells>;
