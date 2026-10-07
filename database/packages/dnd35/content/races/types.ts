import type { Modifier, Property } from "@/database/packages/dnd35/content/customization/types.ts";
import type { SizeType } from "@/shared/enums.ts";

/** A race: its size, its speed, its modifiers and properties, and its kind (a familiar's, an animal companion's…). */
export type RaceSeed = {
  name: string;
  description: string;
  size: SizeType;
  baseSpeed: number;
  kind?: string;
  modifiers?: Modifier[];
  properties?: Property[];
};
