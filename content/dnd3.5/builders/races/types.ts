import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A race: its fields as stored (its size, its speed…), its modifiers, and its partition, the kind of creature it's for
 * (a familiar's, an animal companion's…: a bonded creature's race gives its own, `BondContent`; a player character's
 * without one).
 */
export interface RaceSeed {
  description: string;
  fields: RaceFields;
  modifiers?: Modifier[];
  name: string;
  partition?: string;
}

/**
 * A race's fields a seed gives, as stored: some of those 3.5 declares a race's (`ENTITY_FIELDS.races`), by stored
 * field, each of its kind.
 */
export type RaceFields = StoredFieldValues<typeof ENTITY_FIELDS.races>;
