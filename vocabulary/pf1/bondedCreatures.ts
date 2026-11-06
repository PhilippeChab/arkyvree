/**
 * The bonded creatures' numbers, as the Core Rulebook and the Bestiary give them: the animal companion's base
 * statistics table and the druid's animals with their advancement, the familiars' stat blocks and what each grants its
 * master, the paladin's bonded mount, and an animal's hit die, progressions, skills and tricks.
 */

import type { SizeType } from "./sizes.ts";
import type { SkillName } from "./skills.ts";

interface BondedRaceAbilities {
  charisma: number;
  constitution: number;
  dexterity: number;
  intelligence: number;
  strength: number;
  wisdom: number;
}

/**
 * What an animal companion gains at its advancement, its master's 4th or 7th effective druid level, on top of the base
 * statistics table's.
 */
interface CompanionAdvancement {
  /** What it adds to its ability scores, by ability: Str +8, Dex –2, Con +4 for one that grows to Large. */
  abilities?: Partial<BondedRaceAbilities>;
  /** The effective druid level it comes at: 4 or 7. */
  level: number;
  /** What it adds to its starting natural armor bonus. */
  naturalArmor?: number;
  /** Its natural attacks from then on, all of them, in place of its starting ones. */
  naturalAttacks?: NaturalAttack[];
  /** Its size from then on. */
  size?: SizeType;
  /** The special attacks it gains: one named as a starting one replaces it (the big cat's rake, from 1d4 to 1d6). */
  specialAttacks?: string[];
  /** The special qualities it gains. */
  specialQualities?: string[];
}

interface NaturalAttack {
  /** An attack made instead of those before it, not beside them: the crocodile's tail slap, or its bite. */
  alternative?: true;
  count?: number;
  /** The attack's damage dice, before Strength. */
  damage: string;
  /** What a feat its stat block lists, which the ruleset doesn't have, adds to its attack: none of these animals. */
  misc?: number;
  name: string;
  /**
   * A secondary attack: base attack bonus –5 and half the Strength bonus. An animal companion's attacks are primary
   * unless its entry says otherwise (the horse's hooves), and so is a creature's only kind of attack (the pony's).
   */
  secondary?: true;
  /** What a hit does beside its damage: a free trip, poison, attach. */
  special?: string;
  /** Its damage types, as the Bestiary's natural attacks table gives them. */
  type: string;
}

/** A creature's speeds, in feet, by movement: none where it has none (a shark's on land). */
interface Speeds {
  burrow?: number;
  climb?: number;
  fly?: number;
  land?: number;
  swim?: number;
}

/**
 * A row of the animal companion's base statistics table, by effective druid level: the druid's level, which the levels
 * of any other class that grants an animal companion stack with. Its hit dice (d8s, each with the Constitution
 * modifier) are all of the companion's; its base attack bonus and base saves are an animal's at those hit dice; its
 * skill ranks and feats are their totals.
 */
export interface AnimalCompanionBasics {
  bab: number;
  /** Its hit dice: all of an animal companion's, whose race's `baseHD` is 0. */
  bonusHD: number;
  /** The tricks it knows on top of those it's taught, which its master picks once and for all (`ANIMAL_TRICKS`). */
  bonusTricks: number;
  feats: number;
  fortitude: number;
  /** What it adds to its starting natural armor bonus. */
  natural: number;
  reflex: number;
  /** Its skill ranks, in all: no skill holds more than its hit dice. */
  skills: number;
  /** What it gains at that level, as the table names it: link and share spells, evasion, an ability score increase… */
  special: string[];
  /** What it adds to its Strength and to its Dexterity. */
  strDex: number;
  will: number;
}

/**
 * A bonded creature's statistics before its master's levels add to them: an animal companion's starting statistics, a
 * familiar's stat block.
 */
export interface BondedRaceStatBlock {
  /** Its ability scores: the bonded character's base ones. */
  abilities: BondedRaceAbilities;
  /** An animal companion's advancement, at its master's 4th or 7th effective druid level. */
  advancement?: CompanionAdvancement;
  /** Its stat block's feats, which its advancement counts: a familiar's; an animal companion starts with none. */
  baseFeats?: string[];
  /**
   * Its stat block's hit dice: a familiar's 1, which its master's levels never add to; an animal companion's 0, the base
   * statistics table giving it all of its hit dice (`AnimalCompanionBasics.bonusHD`).
   */
  baseHD: number;
  /** Its natural armor bonus, which its master's levels add to. */
  baseNaturalArmor: number;
  /**
   * The ranks within its skill totals: a familiar's one rank (an animal's 2 + Intelligence modifier a hit die, at least
   * 1), in the skill whose total its ability, size, racial and Skill Focus bonuses fall short of by the rank and the
   * class skill's +3. Its master's ranks replace them where they're better. The raven's printed totals count none.
   */
  baseSkillRanks?: Record<string, number>;
  /** Its stat block's skill totals, as printed: its ranks, ability, size, racial bonuses and feats together. */
  baseSkillTotals?: Record<string, number>;
  /** The stat block's bonus feats, which its advancement doesn't count: none of these animals has one. */
  bonusFeats?: string[];
  /**
   * The feats an animal companion takes, in order, as its hit dice earn them (the base statistics table's Feats), from
   * the animal companion feats (`ANIMAL_COMPANION_FEATS`): the app's picks, which the book leaves to its master. Its
   * first asks for no base attack bonus: a companion takes none that does before its second feat, at 3 hit dice.
   */
  featPriority?: string[];
  /** How well it flies ("average", "good"), which its Fly checks take a modifier by. */
  maneuverability?: string;
  naturalAttacks: NaturalAttack[];
  size?: SizeType;
  /**
   * The skills an animal companion puts its ranks in, one in turn a hit die (the base statistics table's Skills), from
   * the animal companion skills (`ANIMAL_COMPANION_SKILLS`): the app's picks, which the book leaves to its master.
   */
  skillPriority?: string[];
  specialAttacks?: string[];
  /** Its senses and its other special qualities. */
  specialQualities?: string[];
  speeds?: Speeds;
}

/**
 * What a familiar grants its master while they're within a mile of each other: a bonus on a skill's checks or on a
 * save, or hit points.
 */
export interface FamiliarMasterBonus {
  bonus: number;
  /** The checks it's limited to, where it is: the hawk's sight-based and opposed Perception checks in bright light. */
  condition?: string;
  /** Hit points, the toad's. */
  hitPoints?: true;
  save?: "fortitude" | "reflex" | "will";
  skill?: SkillName;
}

/** A row of the paladin's bonded mount's progression (`SPECIAL_MOUNT_BASICS`), from a paladin level on (`minLevel`). */
export interface SpecialMountBasics {
  /** Its hit dice: all of the mount's, an animal companion's at that effective druid level. */
  bonusHD: number;
  /** What it adds to its Dexterity, as to its Strength (`str`). */
  dex: number;
  /** Its Intelligence, at the least: a bonded mount's is never below 6. */
  int: number;
  minLevel: number;
  /** What it adds to its starting natural armor bonus. */
  natural: number;
  /** What it adds to its Strength. */
  str: number;
}

/** The natural attacks' damage types, as the Bestiary's natural attacks table gives them. */
const DAMAGE_TYPES = {
  bite: "Bludgeoning, piercing, and slashing",
  claw: "Bludgeoning and slashing",
  gore: "Piercing",
  hoof: "Bludgeoning",
  tailSlap: "Bludgeoning",
  talons: "Slashing",
} as const;

/**
 * The feats an animal companion takes once its own picks run out, from the animal companion feats (none asks for a
 * base attack bonus or an ability score): with them, its picks reach the eight feats its 16 hit dice give.
 */
const GENERIC_TAIL = ["Toughness", "Iron Will", "Lightning Reflexes", "Great Fortitude", "Blind-Fight"];

/**
 * An animal's base attack bonus's progression by its hit dice, one of `BAB_PROGRESSIONS`: medium, three quarters of its
 * hit dice, as the animal companion table's BAB. An animal companion's and a bonded mount's sheets take theirs by it,
 * at their total hit dice; their classes' levels hold none.
 */
export const ANIMAL_BAB_PROGRESSION = "medium";

/** The animal type's class skills, which are an animal companion's and a familiar's too. */
export const ANIMAL_CLASS_SKILLS: readonly SkillName[] = [
  "Acrobatics",
  "Climb",
  "Fly",
  "Perception",
  "Stealth",
  "Swim",
];

/**
 * What an animal companion can take at its 4th- or 7th-level advancement instead of what its entry lists: +2 Dexterity
 * and +2 Constitution.
 */
export const ANIMAL_COMPANION_ADVANCEMENT_ALTERNATIVE: Partial<BondedRaceAbilities> = { constitution: 2, dexterity: 2 };

/** The animal companion's base statistics table: a row per effective druid level, from the first. */
// oxfmt-ignore
export const ANIMAL_COMPANION_BASICS: AnimalCompanionBasics[] = [
  { bab: 1, bonusHD: 2, bonusTricks: 1, feats: 1, fortitude: 3, natural: 0, reflex: 3, skills: 2, special: ["Link", "Share spells"], strDex: 0, will: 0 },
  { bab: 2, bonusHD: 3, bonusTricks: 1, feats: 2, fortitude: 3, natural: 0, reflex: 3, skills: 3, special: [], strDex: 0, will: 1 },
  { bab: 2, bonusHD: 3, bonusTricks: 2, feats: 2, fortitude: 3, natural: 2, reflex: 3, skills: 3, special: ["Evasion"], strDex: 1, will: 1 },
  { bab: 3, bonusHD: 4, bonusTricks: 2, feats: 2, fortitude: 4, natural: 2, reflex: 4, skills: 4, special: ["Ability score increase"], strDex: 1, will: 1 },
  { bab: 3, bonusHD: 5, bonusTricks: 2, feats: 3, fortitude: 4, natural: 2, reflex: 4, skills: 5, special: [], strDex: 1, will: 1 },
  { bab: 4, bonusHD: 6, bonusTricks: 3, feats: 3, fortitude: 5, natural: 4, reflex: 5, skills: 6, special: ["Devotion"], strDex: 2, will: 2 },
  { bab: 4, bonusHD: 6, bonusTricks: 3, feats: 3, fortitude: 5, natural: 4, reflex: 5, skills: 6, special: [], strDex: 2, will: 2 },
  { bab: 5, bonusHD: 7, bonusTricks: 3, feats: 4, fortitude: 5, natural: 4, reflex: 5, skills: 7, special: [], strDex: 2, will: 2 },
  { bab: 6, bonusHD: 8, bonusTricks: 4, feats: 4, fortitude: 6, natural: 6, reflex: 6, skills: 8, special: ["Ability score increase", "Multiattack"], strDex: 3, will: 2 },
  { bab: 6, bonusHD: 9, bonusTricks: 4, feats: 5, fortitude: 6, natural: 6, reflex: 6, skills: 9, special: [], strDex: 3, will: 3 },
  { bab: 6, bonusHD: 9, bonusTricks: 4, feats: 5, fortitude: 6, natural: 6, reflex: 6, skills: 9, special: [], strDex: 3, will: 3 },
  { bab: 7, bonusHD: 10, bonusTricks: 5, feats: 5, fortitude: 7, natural: 8, reflex: 7, skills: 10, special: [], strDex: 4, will: 3 },
  { bab: 8, bonusHD: 11, bonusTricks: 5, feats: 6, fortitude: 7, natural: 8, reflex: 7, skills: 11, special: [], strDex: 4, will: 3 },
  { bab: 9, bonusHD: 12, bonusTricks: 5, feats: 6, fortitude: 8, natural: 8, reflex: 8, skills: 12, special: ["Ability score increase"], strDex: 4, will: 4 },
  { bab: 9, bonusHD: 12, bonusTricks: 6, feats: 6, fortitude: 8, natural: 10, reflex: 8, skills: 12, special: ["Improved evasion"], strDex: 5, will: 4 },
  { bab: 9, bonusHD: 13, bonusTricks: 6, feats: 7, fortitude: 8, natural: 10, reflex: 8, skills: 13, special: [], strDex: 5, will: 4 },
  { bab: 10, bonusHD: 14, bonusTricks: 6, feats: 7, fortitude: 9, natural: 10, reflex: 9, skills: 14, special: [], strDex: 5, will: 4 },
  { bab: 11, bonusHD: 15, bonusTricks: 7, feats: 8, fortitude: 9, natural: 12, reflex: 9, skills: 15, special: [], strDex: 6, will: 5 },
  { bab: 11, bonusHD: 15, bonusTricks: 7, feats: 8, fortitude: 9, natural: 12, reflex: 9, skills: 15, special: [], strDex: 6, will: 5 },
  { bab: 12, bonusHD: 16, bonusTricks: 7, feats: 8, fortitude: 10, natural: 12, reflex: 10, skills: 16, special: ["Ability score increase"], strDex: 6, will: 5 },
];

/**
 * The feats an animal companion of Intelligence 1 or 2 picks from (one of 3 or more takes any it can use). Skill Focus
 * and Weapon Focus are their families, each taken for a skill or a natural weapon.
 */
export const ANIMAL_COMPANION_FEATS = [
  "Acrobatic",
  "Agile Maneuvers",
  "Armor Proficiency, Heavy",
  "Armor Proficiency, Light",
  "Armor Proficiency, Medium",
  "Athletic",
  "Blind-Fight",
  "Combat Reflexes",
  "Diehard",
  "Dodge",
  "Endurance",
  "Great Fortitude",
  "Improved Bull Rush",
  "Improved Initiative",
  "Improved Natural Armor",
  "Improved Natural Attack",
  "Improved Overrun",
  "Intimidating Prowess",
  "Iron Will",
  "Lightning Reflexes",
  "Mobility",
  "Power Attack",
  "Run",
  "Skill Focus",
  "Spring Attack",
  "Stealthy",
  "Toughness",
  "Weapon Finesse",
  "Weapon Focus",
];

/**
 * The skills an animal companion of Intelligence 1 or 2 puts ranks in (one of 3 or more puts them in any skill): an
 * animal's class skills (`ANIMAL_CLASS_SKILLS`), Escape Artist, Intimidate and Survival.
 */
export const ANIMAL_COMPANION_SKILLS: readonly SkillName[] = [
  "Acrobatics",
  "Climb",
  "Escape Artist",
  "Fly",
  "Intimidate",
  "Perception",
  "Stealth",
  "Survival",
  "Swim",
];

/**
 * An animal's average hit points a hit die: a d8's. An animal companion's hit points are that times its hit dice,
 * rounded down, before its Constitution modifier and its feats add to them (the organized play FAQ the animal
 * companion rules quote; the Core Rulebook doesn't say).
 */
export const ANIMAL_HIT_DIE_AVERAGE = 4.5;

/**
 * An animal's saves' progressions, by save: good Fortitude and Reflex, poor Will, as the animal companion table's. An
 * animal companion's and a bonded mount's sheets take their base saves by them, at their total hit dice; their classes'
 * levels hold none.
 */
export const ANIMAL_SAVE_PROGRESSIONS = { fortitude: "good", reflex: "good", will: "poor" } as const;

/**
 * The skill ranks an animal's hit die gives: 2 + its Intelligence modifier, at least 1, and an animal's Intelligence of
 * 1 or 2 makes it 1, the animal companion table's Skills: as many ranks as hit dice.
 */
export const ANIMAL_SKILL_POINTS_PER_HIT_DIE = 1;

/**
 * The tricks an animal can be taught, as the Core Rulebook's Handle Animal lists them, each with the check's DC to
 * teach it: what an animal companion's bonus tricks are picked from. An animal of Intelligence 1 learns three at most,
 * one of Intelligence 2 six, its bonus tricks aside; attacking any creature, not only humanoids, monstrous humanoids,
 * giants and animals, counts as two tricks.
 */
export const ANIMAL_TRICKS: Record<string, number> = {
  Attack: 20,
  Come: 15,
  Defend: 20,
  Down: 15,
  Fetch: 15,
  Guard: 20,
  Heel: 15,
  Perform: 15,
  Seek: 15,
  Stay: 15,
  Track: 20,
  Work: 15,
};

/**
 * The paladin's bonded mount, her divine bond's second form: from her 5th level, a mount that functions as an animal
 * companion at her paladin level as its effective druid level (`SPECIAL_MOUNT_BASICS`), usually a horse for a Medium
 * paladin or a pony for a Small one, with an Intelligence of at least 6. At her 11th level it gains the celestial
 * template, and at her 15th spell resistance of her paladin level + 11.
 */
export const BONDED_MOUNT = {
  celestialTemplateLevel: 11,
  level: 5,
  minIntelligence: 6,
  spellResistance: { bonus: 11, level: 15 },
} as const;

/**
 * The bonded creatures' statistics before their master's levels add to them, by race name.
 *
 * The animal companions are the Core Rulebook's druid's list, each with its starting statistics and its advancement at
 * 4th or 7th level. They have no hit dice of their own (`baseHD` 0): the base statistics table gives them all, with
 * their skill ranks and feats, which `skillPriority` and `featPriority` place. A paladin's bonded mount is one of them,
 * the horse or the pony most often.
 *
 * The familiars are the Core Rulebook's, with their Bestiary stat blocks: a familiar keeps its animal's hit dice, skills
 * and feats, and takes its hit points, base attack bonus and base saves from its master. Its skill totals are as printed
 * (`baseSkillTotals`): small animals like these use Dexterity on Climb and Swim, which the totals count. The sheet shows
 * a total as misc beside the ability's base modifier and the size, so a raised ability raises it; a race's modifiers add
 * on top, and the stat block's own feats come out of it (`STAT_BLOCK_FEAT_SKILL_BONUSES`), each adding its bonus back as
 * the ruleset has it, once.
 *
 * `abilities` replaces the bonded character's base ability scores, which feats' and items' modifiers add to. Its natural
 * attacks replace its unarmed strike.
 */
export const BONDED_RACE_STATS: Record<string, BondedRaceStatBlock> = {
  // Familiars
  Bat: {
    size: "Diminutive",
    speeds: { land: 5, fly: 40 },
    maneuverability: "good",
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 1, dexterity: 15, constitution: 6, intelligence: 2, wisdom: 14, charisma: 5 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite }],
    specialQualities: ["blindsense 20 ft.", "low-light vision"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Fly: 16, Perception: 6 },
    baseSkillRanks: { Fly: 1 },
  },
  Cat: {
    size: "Tiny",
    speeds: { land: 30 },
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 8, intelligence: 2, wisdom: 12, charisma: 7 },
    naturalAttacks: [
      { name: "Claw", damage: "1d2", type: DAMAGE_TYPES.claw, count: 2 },
      { name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite },
    ],
    specialQualities: ["low-light vision", "scent"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Climb: 6, Perception: 5, Stealth: 14 },
    baseSkillRanks: { Perception: 1 },
  },
  Hawk: {
    size: "Tiny",
    speeds: { land: 10, fly: 60 },
    maneuverability: "average",
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 6, dexterity: 17, constitution: 11, intelligence: 2, wisdom: 14, charisma: 7 },
    naturalAttacks: [{ name: "Talons", damage: "1d4", type: DAMAGE_TYPES.talons, count: 2 }],
    specialQualities: ["low-light vision"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Fly: 7, Perception: 14 },
    baseSkillRanks: { Perception: 1 },
  },
  Lizard: {
    size: "Tiny",
    speeds: { land: 20, climb: 20 },
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 8, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite }],
    specialQualities: ["low-light vision"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Acrobatics: 10, Climb: 10, Stealth: 14 },
    baseSkillRanks: { Stealth: 1 },
  },
  Monkey: {
    size: "Tiny",
    speeds: { land: 30, climb: 30 },
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 3, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 12, charisma: 5 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite }],
    specialQualities: ["low-light vision"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Acrobatics: 10, Climb: 10, Perception: 5 },
    baseSkillRanks: { Perception: 1 },
  },
  Owl: {
    size: "Tiny",
    speeds: { land: 10, fly: 60 },
    maneuverability: "average",
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 6, dexterity: 17, constitution: 11, intelligence: 2, wisdom: 15, charisma: 6 },
    naturalAttacks: [{ name: "Talons", damage: "1d4", type: DAMAGE_TYPES.talons, count: 2 }],
    specialQualities: ["low-light vision"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Fly: 7, Perception: 10, Stealth: 15 },
    baseSkillRanks: { Perception: 1 },
  },
  Rat: {
    size: "Tiny",
    speeds: { land: 15, climb: 15, swim: 15 },
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 2, dexterity: 15, constitution: 11, intelligence: 2, wisdom: 13, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite }],
    specialQualities: ["low-light vision", "scent"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Climb: 10, Stealth: 18, Swim: 10 },
    baseSkillRanks: { Stealth: 1 },
  },
  Raven: {
    size: "Tiny",
    speeds: { land: 10, fly: 40 },
    maneuverability: "average",
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 2, dexterity: 15, constitution: 8, intelligence: 2, wisdom: 15, charisma: 7 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite }],
    // A raven familiar speaks a language, as the familiars table says
    specialQualities: ["low-light vision", "speaks one language of its master's choice (Su)"],
    baseFeats: ["Skill Focus (Perception)", "Weapon Finesse"],
    baseSkillTotals: { Fly: 6, Perception: 5 },
  },
  Toad: {
    size: "Diminutive",
    speeds: { land: 5 },
    baseHD: 1,
    baseNaturalArmor: 0,
    abilities: { strength: 1, dexterity: 12, constitution: 6, intelligence: 1, wisdom: 15, charisma: 4 },
    naturalAttacks: [],
    specialQualities: ["low-light vision", "scent"],
    baseFeats: ["Skill Focus (Perception)"],
    baseSkillTotals: { Perception: 5, Stealth: 21 },
    baseSkillRanks: { Stealth: 1 },
  },
  Viper: {
    size: "Tiny",
    speeds: { land: 20, climb: 20, swim: 20 },
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 4, dexterity: 17, constitution: 8, intelligence: 1, wisdom: 13, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d2", type: DAMAGE_TYPES.bite, special: "poison" }],
    specialAttacks: [
      "poison (bite—injury; save Fort DC 9; frequency 1/round for 6 rounds; effect 1d2 Con damage; cure 1 save)",
    ],
    specialQualities: ["low-light vision", "scent"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Climb: 11, Perception: 9, Stealth: 15, Swim: 11 },
    baseSkillRanks: { Perception: 1 },
  },
  Weasel: {
    size: "Tiny",
    speeds: { land: 20, climb: 20 },
    baseHD: 1,
    baseNaturalArmor: 1,
    abilities: { strength: 3, dexterity: 15, constitution: 10, intelligence: 2, wisdom: 12, charisma: 5 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite, special: "attach" }],
    specialAttacks: ["attach"],
    specialQualities: ["low-light vision", "scent"],
    baseFeats: ["Weapon Finesse"],
    baseSkillTotals: { Acrobatics: 10, Climb: 10, "Escape Artist": 3, Stealth: 14 },
    baseSkillRanks: { "Escape Artist": 1 },
  },

  // Animal companions, and the paladin's bonded mount among them
  Ape: {
    size: "Medium",
    speeds: { land: 30, climb: 30 },
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 13, dexterity: 17, constitution: 10, intelligence: 2, wisdom: 12, charisma: 7 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
      { name: "Claw", damage: "1d4", type: DAMAGE_TYPES.claw, count: 2 },
    ],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Athletic", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Climb", "Stealth", "Acrobatics"],
    advancement: {
      level: 4,
      size: "Large",
      naturalArmor: 2,
      naturalAttacks: [
        { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite },
        { name: "Claw", damage: "1d6", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 8, dexterity: -2, constitution: 4 },
    },
  },
  Badger: {
    size: "Small",
    speeds: { land: 30, burrow: 10, climb: 10 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 10, dexterity: 17, constitution: 15, intelligence: 2, wisdom: 12, charisma: 10 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
      { name: "Claw", damage: "1d3", type: DAMAGE_TYPES.claw, count: 2 },
    ],
    specialAttacks: ["rage (as a barbarian for 6 rounds per day)"],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Weapon Finesse", "Dodge", "Improved Initiative", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Escape Artist", "Climb"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [
        { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite },
        { name: "Claw", damage: "1d4", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
    },
  },
  Bear: {
    size: "Small",
    speeds: { land: 40 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 15, dexterity: 15, constitution: 13, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
      { name: "Claw", damage: "1d3", type: DAMAGE_TYPES.claw, count: 2 },
    ],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Endurance", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Climb", "Swim", "Survival"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [
        { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite },
        { name: "Claw", damage: "1d4", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
    },
  },
  Bird: {
    size: "Small",
    speeds: { land: 10, fly: 80 },
    maneuverability: "average",
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 10, dexterity: 15, constitution: 12, intelligence: 2, wisdom: 14, charisma: 6 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
      { name: "Talons", damage: "1d4", type: DAMAGE_TYPES.talons, count: 2 },
    ],
    specialQualities: ["low-light vision"],
    featPriority: ["Weapon Finesse", "Dodge", "Improved Initiative", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Fly", "Stealth"],
    advancement: { level: 4, abilities: { strength: 2, constitution: 2 } },
  },
  Boar: {
    size: "Small",
    speeds: { land: 40 },
    baseHD: 0,
    baseNaturalArmor: 6,
    abilities: { strength: 13, dexterity: 12, constitution: 15, intelligence: 2, wisdom: 13, charisma: 4 },
    naturalAttacks: [{ name: "Gore", damage: "1d6", type: DAMAGE_TYPES.gore }],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Endurance", "Power Attack", "Diehard", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Survival", "Stealth"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [{ name: "Gore", damage: "1d8", type: DAMAGE_TYPES.gore }],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
      specialAttacks: ["ferocity"],
    },
  },
  Camel: {
    size: "Large",
    speeds: { land: 50 },
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 18, dexterity: 16, constitution: 14, intelligence: 2, wisdom: 11, charisma: 4 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite }],
    // Its entry's attack: "bite (1d4) or spit"
    specialAttacks: ["spit (ranged touch attack, target is sickened for 1d4 rounds, range 10 feet)"],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Endurance", "Run", "Improved Initiative", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Survival"],
    advancement: { level: 4, abilities: { strength: 2, constitution: 2 } },
  },
  "Cat, Big": {
    size: "Medium",
    speeds: { land: 40 },
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 13, dexterity: 17, constitution: 13, intelligence: 2, wisdom: 15, charisma: 10 },
    naturalAttacks: [
      { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite },
      { name: "Claw", damage: "1d4", type: DAMAGE_TYPES.claw, count: 2 },
    ],
    specialAttacks: ["rake (1d4)"],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Combat Reflexes", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Acrobatics", "Climb"],
    advancement: {
      level: 7,
      size: "Large",
      naturalArmor: 2,
      naturalAttacks: [
        { name: "Bite", damage: "1d8", type: DAMAGE_TYPES.bite },
        { name: "Claw", damage: "1d6", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 8, dexterity: -2, constitution: 4 },
      specialAttacks: ["grab", "pounce", "rake (1d6)"],
    },
  },
  "Cat, Small": {
    size: "Small",
    speeds: { land: 50 },
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 12, dexterity: 21, constitution: 13, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite, special: "trip" },
      { name: "Claw", damage: "1d2", type: DAMAGE_TYPES.claw, count: 2 },
    ],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Weapon Finesse", "Dodge", "Improved Initiative", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Acrobatics", "Climb"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [
        { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite, special: "trip" },
        { name: "Claw", damage: "1d3", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
      specialQualities: ["sprint"],
    },
  },
  Crocodile: {
    size: "Small",
    speeds: { land: 20, swim: 30 },
    baseHD: 0,
    baseNaturalArmor: 4,
    abilities: { strength: 15, dexterity: 14, constitution: 15, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite }],
    specialQualities: ["hold breath", "low-light vision"],
    featPriority: ["Improved Initiative", "Power Attack", "Stealthy", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Swim"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [
        { name: "Bite", damage: "1d8", type: DAMAGE_TYPES.bite },
        { name: "Tail slap", damage: "1d12", type: DAMAGE_TYPES.tailSlap, alternative: true },
      ],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
      specialAttacks: ["death roll", "grab", "sprint"],
    },
  },
  Dinosaur: {
    size: "Small",
    speeds: { land: 60 },
    baseHD: 0,
    baseNaturalArmor: 1,
    abilities: { strength: 11, dexterity: 17, constitution: 17, intelligence: 2, wisdom: 12, charisma: 14 },
    naturalAttacks: [
      { name: "Talons", damage: "1d6", type: DAMAGE_TYPES.talons, count: 2 },
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
    ],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Weapon Finesse", "Improved Initiative", "Dodge", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Acrobatics", "Survival"],
    advancement: {
      level: 7,
      size: "Medium",
      naturalArmor: 2,
      naturalAttacks: [
        { name: "Talons", damage: "1d8", type: DAMAGE_TYPES.talons, count: 2 },
        { name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite },
        { name: "Claw", damage: "1d4", type: DAMAGE_TYPES.claw, count: 2 },
      ],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
      specialAttacks: ["pounce"],
    },
  },
  Dog: {
    size: "Small",
    speeds: { land: 40 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 13, dexterity: 17, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite }],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Combat Reflexes", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Survival", "Acrobatics", "Stealth"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [{ name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite }],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
    },
  },
  Horse: {
    size: "Large",
    speeds: { land: 50 },
    baseHD: 0,
    baseNaturalArmor: 4,
    abilities: { strength: 16, dexterity: 13, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [
      { name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite },
      { name: "Hoof", damage: "1d6", type: DAMAGE_TYPES.hoof, count: 2, secondary: true },
    ],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Endurance", "Run", "Power Attack", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Acrobatics", "Survival"],
    advancement: { level: 4, abilities: { strength: 2, constitution: 2 }, specialQualities: ["combat trained"] },
  },
  Pony: {
    size: "Medium",
    speeds: { land: 40 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 13, dexterity: 13, constitution: 12, intelligence: 2, wisdom: 11, charisma: 4 },
    naturalAttacks: [{ name: "Hoof", damage: "1d3", type: DAMAGE_TYPES.hoof, count: 2 }],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Endurance", "Run", "Power Attack", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Acrobatics", "Survival"],
    advancement: { level: 4, abilities: { strength: 2, constitution: 2 }, specialQualities: ["combat trained"] },
  },
  Shark: {
    size: "Small",
    speeds: { swim: 60 },
    baseHD: 0,
    baseNaturalArmor: 4,
    abilities: { strength: 13, dexterity: 15, constitution: 15, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite }],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Athletic", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Swim", "Stealth"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [{ name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite }],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
      specialQualities: ["blindsense"],
    },
  },
  "Snake, Constrictor": {
    size: "Medium",
    speeds: { land: 20, climb: 20, swim: 20 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 15, dexterity: 17, constitution: 13, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite }],
    specialAttacks: ["grab"],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Stealthy", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Climb", "Swim"],
    advancement: {
      level: 4,
      size: "Large",
      naturalArmor: 1,
      naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite }],
      abilities: { strength: 8, dexterity: -2, constitution: 4 },
      specialAttacks: ["constrict 1d4"],
    },
  },
  "Snake, Viper": {
    size: "Small",
    speeds: { land: 20, climb: 20, swim: 20 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 8, dexterity: 17, constitution: 11, intelligence: 1, wisdom: 12, charisma: 2 },
    naturalAttacks: [{ name: "Bite", damage: "1d3", type: DAMAGE_TYPES.bite, special: "poison" }],
    specialAttacks: ["poison (frequency 1 round (6), effect 1 Con damage, cure 1 save, Con-based DC)"],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Weapon Finesse", "Improved Initiative", "Stealthy", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Climb", "Swim"],
    advancement: {
      level: 4,
      size: "Medium",
      naturalAttacks: [{ name: "Bite", damage: "1d4", type: DAMAGE_TYPES.bite, special: "poison" }],
      abilities: { strength: 4, dexterity: -2, constitution: 2 },
    },
  },
  Wolf: {
    size: "Medium",
    speeds: { land: 50 },
    baseHD: 0,
    baseNaturalArmor: 2,
    abilities: { strength: 13, dexterity: 15, constitution: 15, intelligence: 2, wisdom: 12, charisma: 6 },
    naturalAttacks: [{ name: "Bite", damage: "1d6", type: DAMAGE_TYPES.bite, special: "trip" }],
    specialQualities: ["low-light vision", "scent"],
    featPriority: ["Improved Initiative", "Power Attack", "Combat Reflexes", ...GENERIC_TAIL],
    skillPriority: ["Perception", "Stealth", "Survival", "Acrobatics"],
    advancement: {
      level: 7,
      size: "Large",
      naturalArmor: 2,
      naturalAttacks: [{ name: "Bite", damage: "1d8", type: DAMAGE_TYPES.bite, special: "trip" }],
      abilities: { strength: 8, dexterity: -2, constitution: 4 },
    },
  },
};

/**
 * How many hit dice apart a creature's feats come, after its first hit die's: two, so its feats are half its hit dice,
 * rounded up (the animal companion table's Feats: 1 at 2 hit dice, 2 at 3, 3 at 5), where 3.5 gave one every third.
 */
export const CREATURE_FEAT_HIT_DICE_INTERVAL = 2;

/**
 * A familiar's base saves, by save: Fortitude +2, Reflex +2, Will +0. Each is its master's instead where its master's
 * is better, with the familiar's own ability modifiers and none of its master's other bonuses.
 */
export const FAMILIAR_BASE_SAVES = { fortitude: 2, reflex: 2, will: 0 } as const;

/** The share of its master's hit points a familiar has: half (`FAMILIAR_HIT_POINTS_DIVISOR`), rounded down. */
export const FAMILIAR_HIT_POINTS_DIVISOR = 2;

/**
 * A familiar's Intelligence: 5, plus one a step of its master's levels (`FAMILIAR_MASTER_LEVELS_PER_STEP`), 15 at
 * most.
 */
export const FAMILIAR_INTELLIGENCE = { base: 5, max: 15 } as const;

/** What each familiar grants its master, by race, as the Core Rulebook's familiars table gives it. */
export const FAMILIAR_MASTER_BONUSES: Record<string, FamiliarMasterBonus> = {
  Bat: { bonus: 3, skill: "Fly" },
  Cat: { bonus: 3, skill: "Stealth" },
  Hawk: { bonus: 3, condition: "sight-based and opposed checks in bright light", skill: "Perception" },
  Lizard: { bonus: 3, skill: "Climb" },
  Monkey: { bonus: 3, skill: "Acrobatics" },
  Owl: { bonus: 3, condition: "sight-based and opposed checks in shadows or darkness", skill: "Perception" },
  Rat: { bonus: 2, save: "fortitude" },
  Raven: { bonus: 3, skill: "Appraise" },
  Toad: { bonus: 3, hitPoints: true },
  Viper: { bonus: 3, skill: "Bluff" },
  Weasel: { bonus: 2, save: "reflex" },
};

/** How many of its master's levels make a step of a familiar's natural armor and Intelligence: two, rounded up. */
export const FAMILIAR_MASTER_LEVELS_PER_STEP = 2;

/** A familiar's natural armor adjustment: one a step of its master's levels, from 1 to 10. */
export const FAMILIAR_NATURAL_ARMOR = { max: 10, min: 1 } as const;

/** A familiar's spell resistance from its master's 11th level: its master's level + 5. */
export const FAMILIAR_SPELL_RESISTANCE = { bonus: 5, level: 11 } as const;

/**
 * The paladin's bonded mount's progression: a row per paladin level from the bond's (`BONDED_MOUNT`), the animal
 * companion table's at that effective druid level, with the bonded mount's least Intelligence. Its Strength and
 * Dexterity bonuses are the table's Str/Dex.
 */
export const SPECIAL_MOUNT_BASICS: SpecialMountBasics[] = ANIMAL_COMPANION_BASICS.slice(BONDED_MOUNT.level - 1).map(
  (row, index) => ({
    bonusHD: row.bonusHD,
    dex: row.strDex,
    int: BONDED_MOUNT.minIntelligence,
    minLevel: BONDED_MOUNT.level + index,
    natural: row.natural,
    str: row.strDex,
  }),
);

/**
 * What the feats a stat block lists add to its skills, by feat, then skill: what its printed totals count. A creature's
 * totals are set without them (`DetailedCharacterBonded.applySkillTotals`). Skill Focus gives +3 (+6 from 10 ranks).
 */
export const STAT_BLOCK_FEAT_SKILL_BONUSES: Record<string, Record<string, number>> = {
  "Skill Focus (Perception)": { Perception: 3 },
};
