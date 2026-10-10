import type { Modifier } from "@/content/core/builders/customization/types.ts";

/** A cleric's domain: its granted power's modifiers and its spells. */
export interface DomainSeed {
  description: string;
  modifiers?: Modifier[];
  name: string;
  /** Its spells, each at its level in the domain (1 to 9). */
  spells: { level: number; name: string }[];
}
