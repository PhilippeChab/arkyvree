import type { Overrides } from "@/codegen/core/references/types.ts";

import type { Choice, Ref } from "./common.ts";
import type { ScrapedFrom } from "./reference.ts";

/**
 * A class as the database gives it: its hit die, its primary abilities (a multiclass's prerequisite), its saving
 * throws and proficiencies, its skill choices, its spellcasting and its starting equipment, what a character who
 * multiclasses into it gains, and its subclasses.
 */
export interface ClassEntry {
  hit_die: number;
  index: string;
  multi_classing: {
    prerequisite_options?: Choice;
    prerequisites?: { ability_score: Ref; minimum_score: number }[];
    proficiencies?: Ref[];
    proficiency_choices?: Choice[];
  };
  name: string;
  primary_ability: { ability_scores: Ref[]; desc: string };
  proficiencies: Ref[];
  proficiency_choices: Choice[];
  saving_throws: Ref[];
  spellcasting?: { info: { desc: string[]; name: string }[]; level: number; spellcasting_ability: Ref };
  starting_equipment_options: unknown[];
  subclasses: Ref[];
}

/** A class's feature, or its subclass's, at the level it's first gained. */
export interface ClassFeature {
  class: Ref;
  description: string;
  index: string;
  /** The class's level, or its subclass's, that first gives it ("Fighter 3"). */
  level: Ref;
  name: string;
  subclass?: Ref;
}

/**
 * A class's level, or its subclass's: its features, its proficiency bonus, its own counts (a barbarian's rages, a
 * rogue's sneak attack dice) and its spellcasting (cantrips, prepared spells, slots by spell level).
 */
export interface ClassLevel {
  class: Ref;
  class_specific?: Record<string, unknown>;
  features: Ref[];
  index: string;
  level: number;
  name: string;
  prof_bonus?: number;
  spellcasting?: Record<string, number>;
  subclass?: Ref;
}

/** A class's reference: the class, its levels and its features, and each of its subclasses with theirs. */
export interface ClassReference {
  _meta: ScrapedFrom<"class">;
  /** Corrections made by hand: read by the detection to come. */
  overrides?: Overrides<unknown>;
  raw: {
    class: ClassEntry;
    features: ClassFeature[];
    levels: ClassLevel[];
    subclasses: Subclass[];
  };
}

/** A subclass, with the levels and features it adds to its class's. */
export interface Subclass {
  features: ClassFeature[];
  levels: ClassLevel[];
  subclass: SubclassEntry;
}

/** A subclass as the database gives it: its summary and description, and its features by level, each described. */
export interface SubclassEntry {
  class: Ref;
  description: string;
  features: { description: string; level: number; name: string }[];
  index: string;
  name: string;
  summary: string;
}
