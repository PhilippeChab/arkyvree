import type { RequirementEntry, ModifierSeed } from "@/database/packages/dnd35/v1/feats/types.ts";

export type BabType = "good" | "medium" | "poor";
export type SaveType = "good" | "poor";

export type FeatType = "general" | "fighter" | "metamagic" | "item creation";

export type FeatReference = {
  _meta: {
    type: "feat";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

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
      properties?: { type: string; value: string }[];
      /** Invalid paths that failed validation — bugs to fix */
      errors?: string[];
      /** Modifier text we couldn't auto-parse — needs human review */
      unresolvedModifiers?: string[];
      /** Prerequisite text we recognized but couldn't map to a requirement */
      unresolvedPrereqs?: string[];
      /** Template expansion config for family feats (Weapon Focus, Skill Focus, etc.) */
      template?: {
        type: "weapon" | "skill" | "school" | "crossbow";
        familyName: string;
      };
    };
  };

  /** Merged data per feat (rebuilt on every sync from detected + overrides) */
  mapping: Record<string, {
    description?: string;
    aptitudes?: string[];
    requirements?: RequirementEntry[];
    modifiers?: ModifierSeed[];
    properties?: { type: string; value: string }[];
    stackable?: boolean;
    selectable?: boolean;
    /** Template expansion config — purely auto-detected, not overridable */
    template?: {
      type: "weapon" | "skill" | "school" | "crossbow";
      familyName: string;
    };
    featNameMap?: Record<string, string>;
    skip?: boolean;
  }> & {
    /** Human-annotated overrides — preserved across re-scrapes */
    overrides: Record<string, {
      skip?: boolean;
      aptitudes?: string[];
      requirements?: RequirementEntry[];
      modifiers?: ModifierSeed[];
      properties?: { type: string; value: string }[];
      stackable?: boolean;
      selectable?: boolean;
      description?: string;
      featNameMap?: Record<string, string>;
    }> & {
      /** Unresolved items that have been reviewed (no further action needed) */
      reviewed?: string[];
    };
  };
};

export type DomainReference = {
  _meta: {
    type: "domain";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

  raw: {
    name: string;
    description: string;
    spells: { name: string; slug?: string; level: number }[];
  }[];

  detected: {
    [domainName: string]: {
      modifiers: ModifierSeed[];
      errors?: string[];
      unresolvedModifiers?: string[];
    };
  };

  mapping: Record<string, {
    description?: string;
    modifiers?: ModifierSeed[];
    featPool?: {
      aptitude: string;
      namePrefix: string;
      items: "martial" | "simple" | "exotic" | "all" | string[];
      grants: string[];
      description?: string;
    };
  }> & {
    overrides: Record<string, {
      name?: string;
      description?: string;
      modifiers?: ModifierSeed[];
      spells?: { name: string; level: number }[];
      featPool?: {
        aptitude: string;
        namePrefix: string;
        items: "martial" | "simple" | "exotic" | "all" | string[];
        grants: string[];
        description?: string;
      };
    }> & {
      /** Domains that have been reviewed (no further action needed) */
      reviewed?: string[];
    };
  };
};

export type WizardSchoolReference = {
  _meta: {
    type: "wizardSchool";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

  raw: {
    name: string;
    description: string;
    prohibitedSchoolCount: number;
  }[];

  /** Human-annotated overrides — preserved across re-scrapes */
  mapping?: {
    overrides: Record<string, {
      description?: string;
    }> & {
      reviewed?: string[];
    };
  };
};

export type SpellReference = {
  _meta: {
    type: "spell";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

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

  /** Human-annotated overrides — preserved across re-scrapes */
  mapping?: {
    overrides: Record<string, {
      description?: string;
      /** Extra class/level entries missing from scraped data */
      levelEntries?: { className: string; level: number }[];
    }> & {
      reviewed?: string[];
    };
  };
};

export type RaceReference = {
  _meta: {
    type: "race";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

  raw: {
    name: string;
    description: string;
    size: string;
    baseSpeed: number;
    abilityAdjustments: { ability: string; value: number }[];
    favoredClass?: string;
    features: { name: string; description: string }[];
  }[];

  detected: {
    [raceName: string]: {
      modifiers: ModifierSeed[];
      errors?: string[];
      unresolvedModifiers?: string[];
    };
  };

  mapping: Record<string, {
    description?: string;
    modifiers?: ModifierSeed[];
    skip?: boolean;
  }> & {
    overrides: Record<string, {
      name?: string;
      description?: string;
      size?: string;
      baseSpeed?: number;
      modifiers?: ModifierSeed[];
      skip?: boolean;
    }> & {
      reviewed?: string[];
    };
  };
};

export type ClassReference = {
  _meta: {
    type: "class";
    sourceUrl: string;
    book: string;
    scrapedAt: string;
  };

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
    saves: { fortitude: SaveType; reflex: SaveType; will: SaveType };
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
    aptitudePicks?: { levels: number[]; target: string }[];
    /** Aptitude pick features where we couldn't generate a valid target path */
    unresolvedAptitudePicks?: string[];
    /** Bonus feat lists — features that let the player pick from existing feats */
    bonusFeatLists?: { aptitude: string; feats: string[]; levels?: number[] }[];
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
      [rawName: string]: {
        seedName?: string;
        description?: string;
        /** Minimum class level at which this feature is gained */
        level?: number;
        stackable?: boolean;
        selectable?: boolean;
        skip?: boolean;
        /** Override the default classFeatureAptitude for this specific feat */
        aptitude?: string;
        modifiers?: ModifierSeed[];
        /** Alternative occurrence names that map to this feature (e.g. "Summon Familiar" → "Familiar") */
        aliases?: string[];
      };
    };
    /** Map from feature occurrence name → mapping key (built by scraper, used by generator) */
    occurrenceMap?: Record<string, string>;
    bonusSpellAbility?: string;
    spells?: { slug: string; perDay: number[][]; known?: number[][]; knowAll?: boolean; noCantrips?: boolean; inheritsFrom?: string };
    /** Manual overrides — fields that are never auto-generated by the scraper */
    overrides?: {
      /** Class description override (for sources that lack inline descriptions) */
      description?: string;
      requirements?: RequirementEntry[];
      classSkills?: string[];
      bab?: BabType;
      saves?: { fortitude: SaveType; reflex: SaveType; will: SaveType };
      /** Suppress spell backfill — class has bonus spells per day, not its own spell slots */
      noSpells?: boolean;
      /** Unresolved items that have been reviewed (no further action needed) */
      reviewed?: string[];
      proficiencies?: string[];
      freeFeats?: [number, string, string][];
      casterType?: "Arcane" | "Divine";
      modifiers?: { level: number; target: string; value: string; valueType: string; operator: string }[];
      aptitudePicks?: { levels: number[]; target: string }[];
      bonusFeatLists?: { aptitude: string; feats: string[]; levels?: number[] }[];
      /** Manual alignment override (for base classes where the source page has no alignment info) */
      alignment?: string;
      /** Manual bonusSpellAbility (when scraper can't detect it from page text) */
      bonusSpellAbility?: string;
      /** Manual spell config overrides (e.g. wizard known table instead of knowAll) */
      spells?: { slug?: string; perDay?: number[][]; known?: number[][]; knowAll?: boolean; noCantrips?: boolean; inheritsFrom?: string };
      /** Per-feature manual overrides — fields here win over auto-generated mapping.features */
      features?: {
        [rawName: string]: {
          seedName?: string;
          description?: string;
          level?: number | null;
          stackable?: boolean;
          selectable?: boolean;
          skip?: boolean;
          aptitude?: string | null;
          modifiers?: ModifierSeed[];
          /** Alternative occurrence names that map to this feature (e.g. "Summon Familiar" → "Familiar") */
          aliases?: string[];
        };
      };
    };
  };
};

export type MagicItemCategory = "specificArmor" | "specificShield" | "specificWeapon"
  | "wondrousItem" | "ring" | "rod" | "staff";

export type MagicItemReference = {
  _meta: {
    type: "magicItem";
    sourceUrls: Record<string, string>;
    book: string;
    scrapedAt: string;
  };

  raw: {
    name: string;
    category: MagicItemCategory;
    description: string;
    metadataText: string;
    spellCharges?: { spell: string; charges: number }[];
  }[];

  detected: Record<string, {
    category: MagicItemCategory;
    aura?: string;
    casterLevel?: number;
    costGp: string;
    weight: string;
    itemType: string;
    slot: string;
    variant?: string;
    baseItem?: string;
    modifiers?: { target: string; operator: string; value: string; valueType: string }[];
  }>;

  mapping: Record<string, {
    description?: string;
    costGp?: string;
    weight?: string;
    slot?: string;
    baseItem?: string | null;
    skip?: boolean;
  }> & {
    overrides: Record<string, {
      description?: string;
      costGp?: string;
      weight?: string;
      slot?: string;
      baseItem?: string | null;
      skip?: boolean;
      aura?: string;
      casterLevel?: number;
    }> & {
      reviewed?: string[];
    };
  };
};

export type ItemReference = {
  _meta: {
    type: "item";
    sourceUrls: { weapons: string; armor: string; goods: string };
    book: string;
    scrapedAt: string;
  };

  raw: {
    weapons: {
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
    }[];
    armor: {
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
    }[];
    goods: {
      name: string;
      tableId: string;
      cost: string;
      weight: string;
    }[];
  };

  detected: {
    weapons: Record<string, {
      generatorName: string | null;
      proficiency: string;
      costGp: string;
      weight: string;
    }>;
    armor: Record<string, {
      generatorName: string | null;
      type: "Armor" | "Shield";
      proficiencyCategory: string;
      costGp: string;
      weight: string;
    }>;
    goods: Record<string, {
      costGp: string;
      weight: string;
      category: string;
    }>;
    unresolved: string[];
  };

  mapping: Record<string, {
    description?: string;
    costGp?: string;
    weight?: string;
    skip?: boolean;
  }> & {
    overrides: Record<string, {
      description?: string;
      costGp?: string;
      weight?: string;
      skip?: boolean;
      generatorName?: string;
    }> & {
      nameMap?: Record<string, string>;
      reviewed?: string[];
    };
  };
};
