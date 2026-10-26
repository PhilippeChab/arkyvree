import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { PartialFieldValues } from "@/shared/customization/fields.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";
import type { SizeType } from "@/vocabulary/dnd3.5/sizes.ts";

/** A race: its size, its speed, its modifiers and fields, and its kind (a familiar's, an animal companion's…). */
export interface RaceSeed {
  baseSpeed: number;
  description: string;
  fields?: RaceFields;
  kind?: string;
  modifiers?: Modifier[];
  name: string;
  size: SizeType;
}

/** A race's fields a seed gives: some of those 3.5 declares a race's (`ENTITY_FIELDS.races`), each of its kind. */
export type RaceFields = PartialFieldValues<typeof ENTITY_FIELDS.races>;
