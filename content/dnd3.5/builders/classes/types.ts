import type { ModifierSeed, RequirementEntry } from "@/content/dnd3.5/builders/customization/types.ts";

/** How fast a class's base attack bonus grows: as fast as its level, three quarters of it, or half. */
export type BabType = "good" | "medium" | "poor";

/** A class: its levels' hit die, base attack, saves and skill points, its class skills and features, its spells. */
export type ClassSeed = {
  /** One more pick in the `target` aptitude at each of these levels. */
  aptitudePicks?: { levels: number[]; target: string }[];
  bab: BabType;
  bonusSpellAbility?: string;
  /** The levels that add a caster level to another class of this type. */
  casterLevelAdvancement?: {
    levels: number[];
    type: "divine" | "arcane" | "any" | "dual";
  };
  casterType?: "Arcane" | "Divine";
  classFeatureAptitude?: string;
  /** The class features the class grants, by level: feats in `classFeatureAptitude`. */
  classFeatures?: [number, string][];
  classSkills: string[];
  description: string;
  /** Feats granted by level, each in its aptitude: `[level, feat, aptitude]`. */
  freeFeats?: [number, string, string][];

  hd: number;
  kind?: string;
  levels: number;
  modifiers?: (ModifierSeed & { level: number })[];
  name: string;
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
};

/** How good a class's save is. */
export type SaveType = "good" | "poor";
