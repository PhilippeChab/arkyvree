import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

/** A cleric's domain: its granted power's modifiers and its spells. */
export type DomainSeed = {
  name: string;
  description: string;
  modifiers?: Modifier[];
  /** Its spells, each at its level in the domain (1 to 9). */
  spells: { name: string; level: number }[];
};
