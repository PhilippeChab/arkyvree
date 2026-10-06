/** The shapes of the content packages' data: the generated books and the hand-written content alike. */

import type { ItemLocation, SizeType } from "@/shared/enums.ts";

/** An ability: its name and what it measures. */
export type AbilityDefinition = { name: string; description: string };

export type BabType = "good" | "medium" | "poor";
/** A creature bonded to a character (a familiar, an animal companion, a special mount): its aptitudes, feats, races and class, all of `kind`. */
export type BondContent = {
  kind: string;
  aptitudes: string[];
  feats: FeatSeed[];
  races: RaceDefinition[];
  klass: ClassSeed;
};
/** An extension's book, as the parser generates it (`generated/<book>/index.ts`). */
export type BookContent = {
  aptitudes: string[];
  standaloneFeats: FeatSeed[];
  classFeats: FeatSeed[];
  /** Core feats the book changes. */
  cowFeats: CowFeatEntry[];
  spells: SpellSeed[];
  /** Core spells the book adds to its spell lists. */
  cowSpells: CowSpellEntry[];
  domains: DomainDefinition[];
  classes: ClassSeed[];
};

export type ClassSeed = {
  name: string;
  description: string;
  hd: number;
  levels: number;
  skillPoints: number;
  bab: BabType;
  saves: { fortitude: SaveType; reflex: SaveType; will: SaveType };
  classSkills: string[];
  kind?: string;
  /** What a character needs to take the first level. */
  requirements?: RequirementEntry[];

  classFeatureAptitude?: string;
  /** The class features the class grants, by level: feats in `classFeatureAptitude`. */
  classFeatures?: [number, string][];
  /** Feats granted in General at the first level. */
  proficiencies?: string[];
  /** Feats granted by level, each in its aptitude: `[level, feat, aptitude]`. */
  freeFeats?: [number, string, string][];
  /** One more pick in the `target` aptitude at each of these levels. */
  aptitudePicks?: { levels: number[]; target: string }[];
  modifiers?: (ModifierSeed & { level: number })[];

  bonusSpellAbility?: string;
  casterType?: "Arcane" | "Divine";

  spells?: {
    /** The spell list's aptitude, as a path segment: "wizardspells". */
    slug: string;
    /** Spells per day by class level, then spell level. */
    perDay: number[][];
    /** Spells known by class level, then spell level, for a class that learns its spells. */
    known?: number[][];
    /** Knows every spell of each level it can cast. */
    knowAll?: boolean;
    /** The tables start at the first spell level. */
    noCantrips?: boolean;
    /** The lists its slots go to instead of `slug`'s, each while its requirements are met (a pious templar's). */
    lists?: { slug: string; requirements: RequirementEntry[] }[];
  };

  /** The levels that add a caster level to another class of this type. */
  casterLevelAdvancement?: {
    type: "divine" | "arcane" | "any" | "dual";
    levels: number[];
  };
};

/**
 * The core rules' content: the SRD's, as the generator wrote it, and the hand-written core rules, template items and
 * bonded creatures, with the class level the cleric's and the wizard's spell levels open at.
 */
export type CoreContent = {
  aptitudes: string[];
  languages: LanguageDefinition[];
  races: RaceDefinition[];
  abilities: AbilityDefinition[];
  skills: SkillDefinition[];
  saves: SaveDefinition[];
  feats: FeatSeed[];
  classes: ClassSeed[];
  /** The items others are made from, which a new ruleset starts with. */
  templateItems: ItemDef[];
  items: ItemDef[];
  spells: SpellSeed[];
  wizardSchools: WizardSchoolDefinition[];
  domains: DomainDefinition[];
  bonds: BondContent[];
  /** The class level each of the cleric's spell levels opens at, which a domain's slots open at too. */
  clericSpellLevels: Record<number, number>;
  /** The class level each of the wizard's spell levels opens at, which a school's slots open at too. */
  wizardSpellLevels: Record<number, number>;
};
/** A core feat an extension changes: more aptitudes it's taken in, and the class levels that also qualify for it. */
export type CowFeatEntry = {
  feat: string;
  requirements: { className: string; level: number }[];
  aptitudes: string[];
};
/** A core spell an extension adds to its spell lists, each at its level there. */
export type CowSpellEntry = {
  spell: string;
  aptitudes: { aptitude: string; level: number }[];
};
export type DomainDefinition = {
  name: string;
  description: string;
  modifiers?: Modifier[];
  /** Its spells, each at its level in the domain (1 to 9). */
  spells: { name: string; level: number }[];
};

export type FeatSeed = {
  name: string;
  description: string;
  stackable?: boolean;
  selectable?: boolean;
  /** One of a family's feats, made for each of its options (`Weapon Focus: Longsword`): its name names it */
  generated?: boolean;
  aptitudes: string[];
  modifiers?: ModifierSeed[];
  requirements?: RequirementEntry[];
  properties?: Property[];
};

export interface ItemDef {
  name: string;
  description: string;
  weight: string;
  costGp: string;
  type: string;
  slot?: ItemLocation;
  properties: Property[];
  /** The template item this one is made from, by name. */
  sourceItem?: string;
  /** A template among magic items, which others are made from (elven chain): seeded with the mundane templates. */
  isTemplate?: true;
  requirements?: RequirementEntry[];
  modifiers?: Modifier[];
}

/** A language: its name, its type (Common, Exotic…) and who speaks it. */
export type LanguageDefinition = { name: string; type: string; description: string };

/** A modifier with no requirements: a class level's, a domain's, a race's or an item's (only a feat's has some). */
export type Modifier = ModifierEffect & { requirements?: never };

/** A modifier's effect: its target, operator and value. */
export type ModifierEffect = { target: string; operator: string; value: string; valueType: string };
/** A feat's modifier, which applies only while its requirements are met. */
export type ModifierSeed = ModifierEffect & { requirements?: RequirementEntry[] };

export type PowerSeed = {
  name: string;
  description: string;
  aptitudes: string[];
  /** The power's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  savingThrow?: string;
  properties: Property[];
};

export type Property = { type: string; value: string };

export type RaceDefinition = {
  name: string;
  description: string;
  size: SizeType;
  baseSpeed: number;
  kind?: string;
  modifiers?: Modifier[];
  properties?: Property[];
};

/** A check: `target` compared to `value` with `operator`. */
export type RequirementCondition = { target: string; operator: string; value: string; valueType: string };

export type RequirementEntry = RequirementCondition | RequirementGroup;

/** Requirements chained with `and` or `or`. */
export type RequirementGroup = { chainingOperator: "and" | "or"; children: RequirementEntry[] };

/** A save: its name, what it resists, and the ability it adds. */
export type SaveDefinition = { name: string; description: string; ability: string };

export type SaveType = "good" | "poor";

/** A skill: its name, what it does, its key ability, and whether armor weighs on it or it can be used untrained. */
export type SkillDefinition = {
  name: string;
  description: string;
  ability: string;
  impactedByWeight?: boolean;
  checkPenaltyMultiplier?: number;
  usableWithoutTraining?: boolean;
};

export type SpellSeed = PowerSeed & { level: number };

export type WizardSchoolDefinition = {
  name: string;
  description: string;
  prohibitedSchoolCount: number;
};
