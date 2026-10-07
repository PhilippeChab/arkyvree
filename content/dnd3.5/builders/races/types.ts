import type { Modifier, Property } from "@/content/dnd3.5/builders/customization/types.ts";
import type { SizeType } from "@/shared/enums.ts";

/** A race: its size, its speed, its modifiers and properties, and its kind (a familiar's, an animal companion's…). */
export type RaceSeed = {
  baseSpeed: number;
  description: string;
  kind?: string;
  modifiers?: Modifier[];
  name: string;
  properties?: Property[];
  size: SizeType;
};
