import type { Modifier, ModifierSeed, Property, RequirementEntry } from "@/database/packages/dnd35/content/types.ts";

// References as loaded (`loadReference`): what the file stores (`_meta`, `raw`, `overrides`), with `detected` and
// `mapping` derived from it (items and magic items have only `detected`; spells and wizard schools, neither). The
// file itself holds only `StoredReference` (tools/references.ts).

export type BabType = "good" | "medium" | "poor";
export type SaveType = "good" | "poor";
type Saves = { fortitude: SaveType; reflex: SaveType; will: SaveType };

/** Where and when a reference was scraped. */
type ScrapedMeta<T extends string> = { type: T; sourceUrl: string; book: string; scrapedAt: string };

/**
 * A reference's overrides (corrections made by hand, stored in its file and kept across re-scrapes) by entry name,
 * and the entries reviewed (no further action needed).
 */
type Overrides<T> = Record<string, T> & { reviewed?: string[] };

/**
 * A domain's or a race's detected modifiers, the invalid paths (bugs to fix) and the text that couldn't be parsed (to
 * review). Their modifiers have no requirements: only a feat's has.
 */
export type DetectedModifiers = { modifiers: Modifier[]; errors?: string[]; unresolvedModifiers?: string[] };

/** A named piece of text: a race's trait, a class feature's sub-option. */
export type NamedText = { name: string; description: string };

/** A class level pick of an aptitude's feats. */
export type AptitudePick = { levels: number[]; target: string };

/** Existing feats a class lets its player pick, as an aptitude (at `levels` only, when given). */
export type BonusFeatList = { aptitude: string; feats: string[]; levels?: number[] };

/** Template expansion config for family feats (Weapon Focus, Skill Focus, etc.) */
type FeatTemplate = { type: "weapon" | "skill" | "school" | "crossbow"; familyName: string };

/** A feat's fields a mapping derives and an override sets. */
type FeatFields = {
  description?: string;
  aptitudes?: string[];
  requirements?: RequirementEntry[];
  modifiers?: ModifierSeed[];
  properties?: Property[];
  stackable?: boolean;
  selectable?: boolean;
  featNameMap?: Record<string, string>;
  skip?: boolean;
};

/** A domain's pool of feats (e.g. War Domain Weapon: a feat per martial weapon). */
type DomainFeatPool = {
  aptitude: string;
  namePrefix: string;
  items: "martial" | "simple" | "exotic" | "all" | string[];
  grants: string[];
  description?: string;
};

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

/**
 * A class table column its levels' modifiers read (`progression[].columns`): at each level its value changes, `add`
 * the rise of its number (the table gives the total so far, "+10 ft.") or `set` its text ("1d8").
 */
export type ColumnModifier = { target: string; operator: "add" | "set"; requirements?: RequirementEntry[] };

/** A class's own spell list: its slots per day, its spells known, and the list it inherits. */
type ClassSpells = {
  slug: string;
  perDay: number[][];
  known?: number[][];
  knowAll?: boolean;
  noCantrips?: boolean;
  inheritsFrom?: InheritedSpellList;
};

/** A class feature's fields a mapping derives and an override sets. */
type ClassFeatureFields = {
  seedName?: string;
  description?: string;
  stackable?: boolean;
  selectable?: boolean;
  skip?: boolean;
  modifiers?: ModifierSeed[];
  /** Alternative occurrence names that map to this feature (e.g. "Summon Familiar" → "Familiar") */
  aliases?: string[];
};

/** An item's fields an override sets. */
type ItemFields = { description?: string; costGp?: string; weight?: string; skip?: boolean };

/** A magic item's fields an override sets. */
type MagicItemFields = ItemFields & {
  slot?: string;
  baseItem?: string | null;
  modifiers?: Modifier[];
  /** Properties the item adds to those the generator gives it (a composite bow's Strength rating). */
  properties?: Property[];
  /**
   * A specific armor others are made from, as its base armor is: elven chain, whose proficiency is its own (light), not
   * its base's. Its properties are its base armor's, its own over them.
   */
  template?: boolean;
};

export type WeaponRow = {
  name: string;
  proficiency: string;
  category: string;
  cost: string;
  dmgSmall: string;
  dmgMedium: string;
  critical: string;
  rangeIncrement: string;
  weight: string;
  damageType: string;
};

export type ArmorRow = {
  name: string;
  category: string;
  cost: string;
  acBonus: string;
  maxDexBonus: string;
  armorCheckPenalty: string;
  arcaneSpellFailure: string;
  speed30: string;
  speed20: string;
  weight: string;
};

export type FeatReference = {
  _meta: ScrapedMeta<"feat">;

  /** All feats scraped from the page */
  raw: {
    name: string;
    featType: string;
    prerequisiteText: string;
    benefit: string;
    normal?: string;
    special?: string;
  }[];

  /** Auto-detected requirements for each feat */
  detected: {
    [featName: string]: {
      aptitudes: string[];
      requirements: RequirementEntry[];
      featNameMap: Record<string, string>;
      stackable?: boolean;
      modifiers?: ModifierSeed[];
      properties?: Property[];
      /** Invalid paths that failed validation — bugs to fix */
      errors?: string[];
      /** Modifier text we couldn't auto-parse — needs human review */
      unresolvedModifiers?: string[];
      /** Prerequisite text we recognized but couldn't map to a requirement */
      unresolvedPrereqs?: string[];
      template?: FeatTemplate;
    };
  };

  overrides?: Overrides<FeatFields>;

  /** Merged data per feat: derived from detected and the overrides when the reference is loaded */
  mapping: Record<
    string,
    FeatFields & {
      /** Template expansion config — purely auto-detected, not overridable */
      template?: FeatTemplate;
    }
  >;
};

export type DomainReference = {
  _meta: ScrapedMeta<"domain"> & {
    /** Which domains the page lists ("all"). */
    filter?: string;
  };

  raw: {
    name: string;
    description: string;
    spells: { name: string; slug?: string; level: number }[];
  }[];

  detected: Record<string, DetectedModifiers>;

  overrides?: Overrides<{
    name?: string;
    description?: string;
    modifiers?: Modifier[];
    spells?: { name: string; level: number }[];
    featPool?: DomainFeatPool;
  }>;

  mapping: Record<
    string,
    {
      description?: string;
      modifiers?: Modifier[];
      featPool?: DomainFeatPool;
    }
  >;
};

export type WizardSchoolReference = {
  _meta: ScrapedMeta<"wizardSchool">;

  raw: {
    name: string;
    description: string;
    prohibitedSchoolCount: number;
  }[];

  overrides?: Overrides<{ description?: string }>;
};

export type SpellReference = {
  _meta: ScrapedMeta<"spell">;

  /** All spells scraped from the detail page */
  raw: {
    name: string;
    /** Anchor ID from the SRD page (e.g. "obscuring-mist") — used to cross-reference domain spell lists */
    slug: string;
    school: string;
    subschool?: string;
    descriptors: string[];
    /** Level entries as scraped, e.g. "Sor/Wiz 3", "Clr 2" */
    levelEntries: { className: string; level: number }[];
    components: string[];
    castingTime: string;
    range: string;
    target?: string;
    effect?: string;
    area?: string;
    duration: string;
    savingThrow: string;
    spellResistance: string;
    description: string;
  }[];

  overrides?: Overrides<{
    description?: string;
    /** Extra class/level entries missing from scraped data */
    levelEntries?: { className: string; level: number }[];
  }>;
};

export type RaceReference = {
  _meta: ScrapedMeta<"race">;

  raw: {
    name: string;
    description: string;
    size: string;
    baseSpeed: number;
    abilityAdjustments: { ability: string; value: number }[];
    favoredClass?: string;
    features: NamedText[];
  }[];

  detected: Record<string, DetectedModifiers>;

  overrides?: Overrides<{
    name?: string;
    description?: string;
    size?: string;
    baseSpeed?: number;
    modifiers?: Modifier[];
    /** Properties the engine reads off the race (the dwarf's speed in armor). */
    properties?: Property[];
    skip?: boolean;
  }>;

  mapping: Record<
    string,
    {
      description?: string;
      modifiers?: Modifier[];
    }
  >;
};

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

export type MagicItemCategory =
  | "specificArmor"
  | "specificShield"
  | "specificWeapon"
  | "wondrousItem"
  | "ring"
  | "rod"
  | "staff";

export type MagicItemReference = {
  _meta: Omit<ScrapedMeta<"magicItem">, "sourceUrl"> & { sourceUrls: Record<string, string> };

  raw: {
    name: string;
    category: MagicItemCategory;
    description: string;
    metadataText: string;
    spellCharges?: { spell: string; charges: number }[];
  }[];

  detected: Record<
    string,
    {
      category: MagicItemCategory;
      aura?: string;
      casterLevel?: number;
      costGp: string;
      weight: string;
      itemType: string;
      slot: string;
      variant?: string;
      baseItem?: string;
      modifiers?: Modifier[];
      unresolvedModifiers?: string[];
    }
  >;

  overrides?: Overrides<MagicItemFields & { aura?: string; casterLevel?: number }>;
};

export type ItemReference = {
  _meta: Omit<ScrapedMeta<"item">, "sourceUrl"> & { sourceUrls: { weapons: string; armor: string; goods: string } };

  raw: {
    weapons: WeaponRow[];
    armor: ArmorRow[];
    goods: {
      name: string;
      tableId: string;
      cost: string;
      weight: string;
    }[];
  };

  detected: {
    weapons: Record<
      string,
      {
        generatorName: string | null;
        proficiency: string;
        costGp: string;
        weight: string;
      }
    >;
    armor: Record<
      string,
      {
        generatorName: string | null;
        type: "Armor" | "Shield";
        proficiencyCategory: string;
        costGp: string;
        weight: string;
      }
    >;
    goods: Record<
      string,
      {
        costGp: string;
        weight: string;
        category: string;
      }
    >;
    unresolved: string[];
  };

  overrides?: Overrides<ItemFields> & { nameMap?: Record<string, string> };
};
