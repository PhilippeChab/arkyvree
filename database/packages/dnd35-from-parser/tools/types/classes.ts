import type { ScrapedMeta } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type { BabType, SaveType } from "@/database/packages/dnd35/content/classes/types.ts";
import type { ModifierSeed, RequirementEntry } from "@/database/packages/dnd35/content/customization/types.ts";

/** A class feature's fields a mapping derives and an override sets. */
type ClassFeatureFields = {
  seedName?: string;
  description?: string;
  stackable?: boolean;
  selectable?: boolean;
  skip?: boolean;
  modifiers?: ModifierSeed[];
  /** What it takes to pick it, when it's a pick (a pious templar's blackguard list: not good) */
  requirements?: RequirementEntry[];
  /** Alternative occurrence names that map to this feature (e.g. "Summon Familiar" → "Familiar") */
  aliases?: string[];
};

/** A class's own spell list: its slots per day, its spells known, and the list it inherits. */
type ClassSpells = {
  slug: string;
  perDay: number[][];
  known?: number[][];
  knowAll?: boolean;
  noCantrips?: boolean;
  inheritsFrom?: InheritedSpellList;
  /** The lists its slots go to instead of its own, each while its requirements are met */
  lists?: ClassSpellList[];
  /**
   * The pool a domain is picked from (a divine crusader's), whose spells are her list: a feat per domain her book and
   * the core rules have, joining its list to hers (`aptitudes.<domain>domainspells.joinsclasslist`)
   */
  domainPool?: string;
};

type Saves = { fortitude: SaveType; reflex: SaveType; will: SaveType };

/** A class level pick of an aptitude's feats. */
export type AptitudePick = { levels: number[]; target: string };

/** Existing feats a class lets its player pick, as an aptitude (at `levels` only, when given). */
export type BonusFeatList = { aptitude: string; feats: string[]; levels?: number[] };

export type ClassReference = {
  _meta: ScrapedMeta<"class">;

  raw: {
    name: string;
    description: string;
    hitDie: string;
    skillPointsPerLevel: string;
    classSkills: string[];
    prerequisites: {
      text: string;
      parsed: {
        bab?: number;
        skills?: { name: string; ranks: number }[];
        feats?: string[];
        spells?: string;
        alignment?: string;
        special?: string[];
        saves?: { name: string; base: number }[];
        casterLevel?: { type: "divine" | "arcane" | "any"; level: number }[];
        classLevels?: { className: string; level: number }[];
      };
    };
    progression: {
      level: number;
      bab: number;
      fortSave: number;
      refSave: number;
      willSave: number;
      special: string[];
      spellsPerDay?: string;
      /** The table's other columns, by header ("AC Bonus": "+1") */
      columns?: Record<string, string>;
    }[];
    classFeatures: {
      name: string;
      type?: string;
      description: string;
    }[];
    /** Separate "Spells Known" table, if present */
    spellsKnown?: string[];
    /** Whether the spell table starts at 0th level (cantrips) */
    hasCantrips?: boolean;
    /** Detected bonus spell ability from class feature text */
    bonusSpellAbility?: string;
  };

  detected: {
    hd: number;
    levels: number;
    skillPoints: number;
    bab: BabType;
    saves: Saves;
    casterLevelAdvancement?: { type: "divine" | "arcane" | "any" | "dual"; levels: number[] };
    requirements: RequirementEntry[];
    /** Map from feat slug (e.g. "pointblankshot") to original name (e.g. "Point Blank Shot") */
    featNameMap: Record<string, string>;
    featureOccurrences: { name: string; levels: number[] }[];
    /** Parsed numeric spell table from progression */
    spellsPerDay?: number[][];
    /** Parsed numeric spells known table */
    spellsKnown?: number[][];
    /** Whether class has own spell list (not advancement of existing) */
    hasOwnSpells?: boolean;
    /** Detected caster type from class feature descriptions */
    casterType?: "Arcane" | "Divine";
    /** Auto-detected aptitude picks from class features with choice language */
    aptitudePicks?: AptitudePick[];
    /** Aptitude pick features where we couldn't generate a valid target path */
    unresolvedAptitudePicks?: string[];
    /** Bonus feat lists — features that let the player pick from existing feats */
    bonusFeatLists?: BonusFeatList[];
    /** Locked creature-type favored-enemy variants (Gnome Giant-slayer's
     *  "Favored Enemy (Giant)" etc.) — re-routed at generation time to the
     *  shared `Favored Enemy: <Type>` variant. The keyed feature is suppressed
     *  from feat output; class progression grants the shared variant instead. */
    lockedFavoredEnemies?: { featureName: string; levels: number[]; creatureType: string }[];
    /** Invalid paths that failed validation — bugs to fix */
    errors?: string[];
    /** Prerequisite text we couldn't auto-parse — needs human review */
    unresolvedPrereqs?: string[];
  };

  mapping: {
    classFeatureAptitude: string;
    features: {
      [rawName: string]: ClassFeatureFields & {
        /** Minimum class level at which this feature is gained */
        level?: number;
        /** Override the default classFeatureAptitude for this specific feat */
        aptitude?: string;
      };
    };
    /** Map from feature occurrence name → mapping key (derived at load, used by generator) */
    occurrenceMap?: Record<string, string>;
    bonusSpellAbility?: string;
    spells?: ClassSpells;
  };

  overrides?: {
    /** Leave the class out of the seed: one the rules can't support (the Shadowmind needs psionics) */
    skip?: boolean;
    /** Class description override (for sources that lack inline descriptions) */
    description?: string;
    requirements?: RequirementEntry[];
    classSkills?: string[];
    bab?: BabType;
    saves?: Saves;
    /** Suppress spell backfill — class has bonus spells per day, not its own spell slots */
    noSpells?: boolean;
    /** Unresolved items that have been reviewed (no further action needed) */
    reviewed?: string[];
    proficiencies?: string[];
    freeFeats?: [number, string, string][];
    casterType?: "Arcane" | "Divine";
    modifiers?: (ModifierSeed & { level: number })[];
    /** The table columns its levels' modifiers read, by header */
    columns?: Record<string, ColumnModifier>;
    aptitudePicks?: AptitudePick[];
    bonusFeatLists?: BonusFeatList[];
    /** Manual alignment override (for base classes where the source page has no alignment info) */
    alignment?: string;
    /** Manual bonusSpellAbility (when scraper can't detect it from page text) */
    bonusSpellAbility?: string;
    /** Manual spell config overrides (e.g. wizard known table instead of knowAll) */
    spells?: Partial<ClassSpells>;
    /** Per-feature manual overrides — fields here win over auto-generated mapping.features */
    features?: {
      [rawName: string]: ClassFeatureFields & {
        level?: number | null;
        aptitude?: string | null;
      };
    };
  };
};

/** A book's class reference, with its file's name (`wizard.json`). */
export type ClassReferenceFile = { file: string; ref: ClassReference };

/** A list a class's slots can go to, while its requirements are met: a pious templar's paladin or blackguard list. */
export type ClassSpellList = { name: string; inheritsFrom: InheritedSpellList; requirements: RequirementEntry[] };

/**
 * A class table column its levels' modifiers read (`progression[].columns`): at each level its value changes, `add`
 * the rise of its number (the table gives the total so far, "+10 ft.") or `set` its text ("1d8").
 */
export type ColumnModifier = { target: string; operator: "add" | "set"; requirements?: RequirementEntry[] };

/**
 * The spell list a class draws on, made of other classes' (`classes`, a spell at its level on the first that has it):
 * only their spells of `schools` when given, none with one of `excludeDescriptors`, and `additions`, its own spells by
 * level.
 */
export type InheritedSpellList = {
  classes: string[];
  schools?: string[];
  excludeDescriptors?: string[];
  additions?: Record<string, string[]>;
};
