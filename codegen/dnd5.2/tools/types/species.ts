import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Choice, Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A species as the book gives it, its traits and its subspecies (an elf's lineage, a dragonborn's ancestry) read whole
 * in place of the database's references to them: its creature type, size (or its sizes to choose from), speed.
 */
export interface SpeciesEntry {
  index: string;
  name: string;
  size?: string;
  size_options?: Choice;
  speed: number;
  subspecies: SubspeciesEntry[];
  traits: TraitEntry[];
  type: string;
}

/** The book's species. */
export interface SpeciesReference {
  _meta: ScrapedFrom<"species">;
  /** Corrections made by hand, by entry's name: its fields the SRD gives otherwise than the database (a Human's size, which it chooses). */
  overrides?: Overrides<Partial<SpeciesEntry>>;
  raw: SpeciesEntry[];
}

/** A subspecies (an elven lineage, a draconic ancestry), its traits read whole: the damage type an ancestry gives. */
export interface SubspeciesEntry {
  damage_type?: Ref;
  index: string;
  name: string;
  traits: TraitEntry[];
}

/** A species' trait, or a subspecies': its text, the choices it gives, the spells it grants, a speed it sets. */
export interface TraitEntry {
  description: string;
  index: string;
  name: string;
  proficiency_choices?: Choice;
  speed?: number;
  spells?: unknown[];
}
