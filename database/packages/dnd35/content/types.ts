import type { SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";

// The shapes of the content packages' data: the generated books and the hand-written content alike.

/** A check: `target` compared to `value` with `operator`. */
export type RequirementCondition = { target: string; operator: string; value: string; valueType: string };
/** Requirements chained with `and` or `or`. */
export type RequirementGroup = { chainingOperator: "and" | "or"; children: RequirementEntry[] };
export type RequirementEntry = RequirementCondition | RequirementGroup;

/** A modifier's effect: its target, operator and value. */
export type ModifierEffect = { target: string; operator: string; value: string; valueType: string };
/** A modifier with no requirements: a class level's, a domain's, a race's or an item's (only a feat's has some). */
export type Modifier = ModifierEffect & { requirements?: never };
/** A feat's modifier, which applies only while its requirements are met. */
export type ModifierSeed = ModifierEffect & { requirements?: RequirementEntry[] };
export type Property = { type: string; value: string };

export type FeatSeed = {
  name: string;
  description: string;
  stackable?: boolean;
  selectable?: boolean;
  aptitudes: string[];
  modifiers?: ModifierSeed[];
  requirements?: RequirementEntry[];
  properties?: Property[];
};

export type PowerSeed = {
  name: string;
  description: string;
  aptitudes: string[];
  /** The power's level in an aptitude, where it isn't the spell's level. */
  aptitudeLevels?: Record<string, number>;
  savingThrow?: string;
  properties: Property[];
};

export type SpellSeed = PowerSeed & { level: number };

export type BabType = "good" | "medium" | "poor";
export type SaveType = "good" | "poor";

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
  modifiers?: (Modifier & { level: number })[];

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
  };

  /** The levels that add a caster level to another class of this type. */
  casterLevelAdvancement?: {
    type: "divine" | "arcane" | "any" | "dual";
    levels: number[];
  };
};

type SizeType = "Fine" | "Diminutive" | "Tiny" | "Small" | "Medium" | "Large" | "Huge" | "Gargantuan" | "Colossal";

export type RaceDefinition = {
  name: string;
  description: string;
  size: SizeType;
  baseSpeed: number;
  kind?: string;
  modifiers?: Modifier[];
};

type Slot = (typeof SLOT_OPTIONS)[number];

export interface ItemDef {
  name: string;
  description: string;
  weight: string;
  costGp: string;
  type: string;
  slot?: Slot;
  properties: Property[];
  /** The template item this one is made from, by name. */
  sourceItem?: string;
  requirements?: RequirementEntry[];
  modifiers?: Modifier[];
}

export type DomainDefinition = {
  name: string;
  description: string;
  modifiers?: Modifier[];
  /** Its spells, each at its level in the domain (1 to 9). */
  spells: { name: string; level: number }[];
};

export type WizardSchoolDefinition = {
  name: string;
  description: string;
  prohibitedSchoolCount: number;
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
