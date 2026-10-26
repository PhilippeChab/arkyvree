import type { ModifierSeed, RequirementEntry } from "@/content/core/builders/customization/types.ts";
import type { StoredFieldValues } from "@/shared/customization/fields.ts";
import type { CasterType } from "@/vocabulary/dnd3.5/classes.ts";
import type { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The levels of a class that add a caster level to another class: an arcane or a divine one, any one, or both of a dual
 * caster's.
 */
export interface CasterLevelAdvancement {
  levels: number[];
  type: Lowercase<CasterType> | "any" | "dual";
}

/**
 * A class: its fields as stored (its hit die, its caster type), its single links by role, each naming an ability by its
 * name (the one its bonus spells come from, `bonusSpellAbility`), its partition (the kind of creature it's for: a
 * familiar's, a special mount's…; a player character's without one); and its levels' base attack, saves and skill
 * points, its class skills and features, its spells.
 */
export interface ClassSeed {
  /** One more pick in the `target` aptitude at each of these levels. */
  aptitudePicks?: { levels: number[]; target: string }[];
  bab: BabType;
  /** The levels that add a caster level to another class of this type. */
  casterLevelAdvancement?: CasterLevelAdvancement;
  classFeatureAptitude?: string;
  /** The class features the class grants, by level: feats in `classFeatureAptitude`. */
  classFeatures?: [number, string][];
  classSkills: string[];
  description: string;
  fields: ClassFields;
  /** Feats granted by level, each in its aptitude: `[level, feat, aptitude]`. */
  freeFeats?: [number, string, string][];
  levels: number;
  links?: { bonusSpellAbility?: string };
  modifiers?: (ModifierSeed & { level: number })[];
  name: string;
  partition?: string;
  /** Feats granted in General at the first level. */
  proficiencies?: string[];

  /** What a character needs to take the first level. */
  requirements?: RequirementEntry[];
  saves: { fortitude: SaveType; reflex: SaveType; will: SaveType };

  skillPoints: number;

  spells?: {
    /** Knows every spell of each level it can cast. */
    knowAll?: boolean;
    /** Spells known by class level, then spell level, for a class that learns its spells. */
    known?: number[][];
    /** The lists its slots go to instead of `slug`'s, each while its requirements are met (a pious templar's). */
    lists?: { requirements: RequirementEntry[]; slug: string }[];
    /** The tables start at the first spell level. */
    noCantrips?: boolean;
    /** Spells per day by class level, then spell level. */
    perDay: number[][];
    /** The spell list's aptitude, as a path segment: "wizardspells". */
    slug: string;
  };
}

/** How fast a class's base attack bonus grows: as fast as its level, three quarters of it, or half. */
export type BabType = "good" | "medium" | "poor";

/**
 * A class's fields a seed gives, as stored: some of those 3.5 declares a class's (`ENTITY_FIELDS.classes`), by stored
 * field, each of its kind.
 */
export type ClassFields = StoredFieldValues<typeof ENTITY_FIELDS.classes>;

/** How good a class's save is. */
export type SaveType = "good" | "poor";
