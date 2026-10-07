import type { BabType, SaveType } from "@/database/packages/dnd35/content/classes/types.ts";
import type { ModifierSeed, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";

import type { ScrapedMeta } from "./reference.ts";

/** A class feature's fields a mapping derives and an override sets. */
type ClassFeatureFields = {
  /** Alternative occurrence names that map to this feature (e.g. "Summon Familiar" → "Familiar") */
  aliases?: string[];
  description?: string;
  modifiers?: ModifierSeed[];
  /** What it takes to pick it, when it's a pick (a pious templar's blackguard list: not good) */
  requirements?: RequirementEntry[];
  seedName?: string;
  selectable?: boolean;
  skip?: boolean;
  stackable?: boolean;
};

/** A class's own spell list: its slots per day, its spells known, and the list it inherits. */
type ClassSpells = {
  /**
   * The pool a domain is picked from (a divine crusader's), whose spells are her list: a feat per domain her book and
   * the core rules have, joining its list to hers (`aptitudes.<domain>domainspells.joinsclasslist`)
   */
  domainPool?: string;
  inheritsFrom?: InheritedSpellList;
  knowAll?: boolean;
  known?: number[][];
  /** The lists its slots go to instead of its own, each while its requirements are met */
  lists?: ClassSpellList[];
  noCantrips?: boolean;
  perDay: number[][];
  slug: string;
};

type Saves = { fortitude: SaveType; reflex: SaveType; will: SaveType };

/** A class level pick of an aptitude's feats. */
export type AptitudePick = { levels: number[]; target: string };

/** Existing feats a class lets its player pick, as an aptitude (at `levels` only, when given). */
export type BonusFeatList = { aptitude: string; feats: string[]; levels?: number[] };

export type ClassReference = {
  _meta: ScrapedMeta<"class">;

  detected: {
    /** Auto-detected aptitude picks from class features with choice language */
    aptitudePicks?: AptitudePick[];
    bab: BabType;
    /** Bonus feat lists — features that let the player pick from existing feats */
    bonusFeatLists?: BonusFeatList[];
    casterLevelAdvancement?: { levels: number[]; type: "divine" | "arcane" | "any" | "dual" };
    /** Detected caster type from class feature descriptions */
    casterType?: "Arcane" | "Divine";
    /** Invalid paths that failed validation — bugs to fix */
    errors?: string[];
    /** Map from feat slug (e.g. "pointblankshot") to original name (e.g. "Point Blank Shot") */
    featNameMap: Record<string, string>;
    featureOccurrences: { levels: number[]; name: string }[];
    /** Whether class has own spell list (not advancement of existing) */
    hasOwnSpells?: boolean;
    hd: number;
    levels: number;
    /** Locked creature-type favored-enemy variants (Gnome Giant-slayer's
     *  "Favored Enemy (Giant)" etc.) — re-routed at generation time to the
     *  shared `Favored Enemy: <Type>` variant. The keyed feature is suppressed
     *  from feat output; class progression grants the shared variant instead. */
    lockedFavoredEnemies?: { creatureType: string; featureName: string; levels: number[] }[];
    requirements: RequirementEntry[];
    saves: Saves;
    skillPoints: number;
    /** Parsed numeric spells known table */
    spellsKnown?: number[][];
    /** Parsed numeric spell table from progression */
    spellsPerDay?: number[][];
    /** Aptitude pick features where we couldn't generate a valid target path */
    unresolvedAptitudePicks?: string[];
    /** Prerequisite text we couldn't auto-parse — needs human review */
    unresolvedPrereqs?: string[];
  };

  mapping: {
    bonusSpellAbility?: string;
    classFeatureAptitude: string;
    features: {
      [rawName: string]: ClassFeatureFields & {
        /** Override the default classFeatureAptitude for this specific feat */
        aptitude?: string;
        /** Minimum class level at which this feature is gained */
        level?: number;
      };
    };
    /** Map from feature occurrence name → mapping key (derived at load, used by generator) */
    occurrenceMap?: Record<string, string>;
    spells?: ClassSpells;
  };

  overrides?: {
    /** Manual alignment override (for base classes where the source page has no alignment info) */
    alignment?: string;
    aptitudePicks?: AptitudePick[];
    bab?: BabType;
    bonusFeatLists?: BonusFeatList[];
    /** Manual bonusSpellAbility (when scraper can't detect it from page text) */
    bonusSpellAbility?: string;
    casterType?: "Arcane" | "Divine";
    classSkills?: string[];
    /** The table columns its levels' modifiers read, by header */
    columns?: Record<string, ColumnModifier>;
    /** Class description override (for sources that lack inline descriptions) */
    description?: string;
    /** Per-feature manual overrides — fields here win over auto-generated mapping.features */
    features?: {
      [rawName: string]: ClassFeatureFields & {
        aptitude?: string | null;
        level?: number | null;
      };
    };
    freeFeats?: [number, string, string][];
    modifiers?: (ModifierSeed & { level: number })[];
    /** Suppress spell backfill — class has bonus spells per day, not its own spell slots */
    noSpells?: boolean;
    proficiencies?: string[];
    requirements?: RequirementEntry[];
    /** Unresolved items that have been reviewed (no further action needed) */
    reviewed?: string[];
    saves?: Saves;
    /** Leave the class out of the seed: one the rules can't support (the Shadowmind needs psionics) */
    skip?: boolean;
    /** Manual spell config overrides (e.g. wizard known table instead of knowAll) */
    spells?: Partial<ClassSpells>;
  };

  raw: {
    /** Detected bonus spell ability from class feature text */
    bonusSpellAbility?: string;
    classFeatures: {
      description: string;
      name: string;
      type?: string;
    }[];
    classSkills: string[];
    description: string;
    /** Whether the spell table starts at 0th level (cantrips) */
    hasCantrips?: boolean;
    hitDie: string;
    name: string;
    prerequisites: {
      parsed: {
        alignment?: string;
        bab?: number;
        casterLevel?: { level: number; type: "divine" | "arcane" | "any" }[];
        classLevels?: { className: string; level: number }[];
        feats?: string[];
        saves?: { base: number; name: string }[];
        skills?: { name: string; ranks: number }[];
        special?: string[];
        spells?: string;
      };
      text: string;
    };
    progression: {
      bab: number;
      /** The table's other columns, by header ("AC Bonus": "+1") */
      columns?: Record<string, string>;
      fortSave: number;
      level: number;
      refSave: number;
      special: string[];
      spellsPerDay?: string;
      willSave: number;
    }[];
    skillPointsPerLevel: string;
    /** Separate "Spells Known" table, if present */
    spellsKnown?: string[];
  };
};

/** A book's class reference, with its file's name (`wizard.json`). */
export type ClassReferenceFile = { file: string; ref: ClassReference };

/** A list a class's slots can go to, while its requirements are met: a pious templar's paladin or blackguard list. */
export type ClassSpellList = { inheritsFrom: InheritedSpellList; name: string; requirements: RequirementEntry[] };

/**
 * A class table column its levels' modifiers read (`progression[].columns`): at each level its value changes, `add`
 * the rise of its number (the table gives the total so far, "+10 ft.") or `set` its text ("1d8").
 */
export type ColumnModifier = { operator: "add" | "set"; requirements?: RequirementEntry[]; target: string };

/**
 * The spell list a class draws on, made of other classes' (`classes`, a spell at its level on the first that has it):
 * only their spells of `schools` when given, none with one of `excludeDescriptors`, and `additions`, its own spells by
 * level.
 */
export type InheritedSpellList = {
  additions?: Record<string, string[]>;
  classes: string[];
  excludeDescriptors?: string[];
  schools?: string[];
};
