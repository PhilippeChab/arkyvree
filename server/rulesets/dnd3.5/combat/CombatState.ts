import type AbilitiesComponent from "@/server/rulesets/dnd3.5/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/server/rulesets/dnd3.5/classes/ClassesComponent.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import type EncumbranceComponent from "@/server/rulesets/dnd3.5/combat/EncumbranceComponent.ts";
import type { EncumbranceData } from "@/server/rulesets/dnd3.5/combat/EncumbranceComponent.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import { CONSTANTS } from "@/server/rulesets/dnd3.5/constants.ts";
import type SkillsComponent from "@/server/rulesets/dnd3.5/skills/SkillsComponent.ts";

export type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];

export type CombatData = {
  ac: {
    base: number;
    armor: number;
    shield: number;
    readonly dexterity: number;
    natural: number;
    deflection: number;
    /** Dodge bonuses, and any other a flat-footed character loses with its Dexterity bonus */
    dodge: number;
    readonly size: number;
    misc: number;
    /** Keeps the Dexterity and dodge bonuses when flat-footed: uncanny dodge */
    uncannydodge: boolean;
    readonly total: number;
    readonly touch: number;
    readonly flatfooted: number;
  };
  hp: {
    base: number;
    readonly constitution: number;
    misc: number;
    readonly total: number;
  };
  initiative: {
    readonly dexterity: number;
    misc: number;
    readonly total: number;
  };
  bab: number;
  /**
   * A creature's natural attacks: the penalty on its secondary ones (−5, −2 with Multiattack), the extra attacks its
   * primary natural weapon makes, each at −5 (an animal companion's Multiattack without three natural attacks), and how
   * many attacks it makes (two claws are two).
   */
  naturalattacks: { secondarypenalty: number; extraattacks: number; readonly count: number };
  /** Other bonuses to attack with thrown weapons and slings, a melee weapon's thrown attack included: a halfling's +1. */
  throwing: { tohit: number };
  /** Two-weapon fighting: the penalty on each hand's attacks, and how many attacks the off hand makes. */
  twoweapon: {
    mainhandpenalty: number;
    offhandpenalty: number;
    offhandattacks: number;
  };
  grapple: {
    readonly bab: number;
    readonly strength: number;
    readonly size: number;
    misc: number;
    readonly total: number;
  };
  speed: {
    base: number;
    misc: number;
    readonly total: number;
  };
  encumbrance: EncumbranceData;
  /** The category of the heaviest armor worn, "none" without: what a class feature's speed or AC bonus may require */
  armor: { category: ArmorCategory };
  /** Whether a shield is carried, in any weapon set (#236) */
  shield: { held: boolean };
  weaponsets: Record<string, WeaponSet>;
  armors: ArmorsData;
  shields: ShieldsData;
};

/** A natural attack's kind: a primary one at its full attack bonus, a secondary one lower. */
export type NaturalAttackKind = "primary" | "secondary";

/** How a weapon's attack and damage follow the character's abilities, which its totals are recomputed from. */
export type WeaponAbilities = {
  /** The ability it attacks with: Dexterity for a ranged weapon, Strength for a melee one (SRD). */
  attack: "Strength" | "Dexterity";
  /** Whether a Weapon Finesse feat lets it attack with Dexterity instead, when that's better. */
  finesse: boolean;
  /** Its Mighty rating (0 without), when Strength adds to its damage up to it (a bow's "Rating"); null otherwise. */
  strengthRating: number | null;
  /** Whether it takes a penalty to attack below that rating: a composite bow's, which has a WEAPON_MIGHTY, not a plain bow's. */
  ratingRequired: boolean;
};
export type WeaponSet = {
  mainhand: WeaponSlot | null;
  offhand: WeaponSlot | null;
  twohanded: WeaponSlot | null;
};

export type WeaponSlot = {
  name: string;
  itemId: string | null;
  /** The inventory entry holding it: an item held in two places (a dagger in each hand) is two entries. */
  entryId: string | null;
  /**
   * A natural attack's kind, null for a weapon: a primary one adds its whole Strength bonus to damage (one and a half
   * for a creature's only attack), a secondary one takes `combat.naturalattacks.secondarypenalty` to attack and adds half. Either
   * attacks once a round, whatever the base attack bonus.
   */
  natural: NaturalAttackKind | null;
  proficient: boolean;
  finessable: boolean;
  /** A light weapon (the table's Tiny and Small): no extra Strength in two hands, lighter two-weapon penalties off hand. */
  light: boolean;
  /** A ranged weapon (thrown or projectile, not used in melee), which attacks with Dexterity. */
  ranged: boolean;
  range: number;
  reach: number;
  /** How it's held: `mainhand`, `offhand` or `twohanded`, one value per inventory entry */
  wielded: string;
  tohit: {
    readonly strength: number;
    magic: number;
    misc: number;
    readonly size: number;
    /**
     * What the gear costs its attacks: the check penalty of the armor and shields worn without proficiency, a tower
     * shield's −2, and its own penalty in one hand (a crossbow's)
     */
    readonly gearpenalty: number;
    /**
     * Its attacks: these parts, and what only some weapons take, read where it's written: a secondary natural attack's
     * `combat.naturalattacks.secondarypenalty`, a thrown weapon's or a sling's `combat.throwing.tohit`
     */
    readonly total: number[];
  };
  /** A melee weapon's attack when thrown, if it has a range increment: with Dexterity, as every ranged attack. */
  readonly thrown: { dexterity: number; total: number[] } | null;
  /**
   * Its attacks when its set holds an equipped weapon in each hand, or when it's a double weapon held in two hands: its
   * own and its thrown ones (if it has those), with two-weapon fighting's penalties, the off hand's as many as
   * `combat.twoweapon.offhandattacks`; a double weapon's main end's damage too, with its whole Strength bonus, not one
   * and a half.
   */
  readonly twoweapon: { total: number[]; thrown: number[] | null; damage?: string } | null;
  /**
   * A double weapon's other end, held in two hands: its attacks as a light off-hand weapon's, and its damage, its dice
   * with half the Strength bonus.
   */
  readonly offend: { total: number[]; damage: string } | null;
  damage: {
    base: string;
    readonly strength: number;
    magic: number;
    misc: number;
    others: string[];
    readonly total: string;
    types: string[];
    strmultiplier: number | null;
    critical: {
      range: number;
      multiplier: number;
    };
  };
};

/** The category of the armor a character wears, lightest first: none, or the armor's proficiency category. */
export const ARMOR_CATEGORIES = ["none", "light", "medium", "heavy"] as const;

/** A weapon slot's label, as an item's location names it, to its place in the weapon set. */
export const SLOT_MAP: Record<string, keyof WeaponSet> = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
};

/** How a weapon is held, as a path's values: its place in the set, labelled as an item's location names it. */
export const WIELDED_VALUES = Object.entries(SLOT_MAP).map(([label, value]) => ({ value, label }));

/** What a character's combat sheet holds, which its concerns (armor class, hit points, attacks…) compute. */
export default abstract class CombatState {
  constructor(
    protected readonly abilities: AbilitiesComponent,
    protected readonly classes: ClassesComponent,
  ) {}

  /**
   * The sheet. Its sections that compute parts when read (armor class, hit points, initiative, grapple, speed) are
   * placeholders here, which the concerns replace when the character initializes; the encumbrance is the encumbrance's
   * own object, set with its source.
   */
  protected readonly combat: CombatData = {
    ac: {
      base: CONSTANTS.DEFAULT_AC_BASE,
      armor: 0,
      shield: 0,
      dexterity: 0,
      natural: 0,
      deflection: 0,
      dodge: 0,
      size: 0,
      misc: 0,
      uncannydodge: false,
      total: CONSTANTS.DEFAULT_AC_BASE,
      touch: CONSTANTS.DEFAULT_AC_BASE,
      flatfooted: CONSTANTS.DEFAULT_AC_BASE,
    },
    hp: { base: 0, constitution: 0, misc: 0, total: 0 },
    initiative: { dexterity: 0, misc: 0, total: 0 },
    bab: 0,
    naturalattacks: { secondarypenalty: CONSTANTS.SECONDARY_NATURAL_ATTACK_PENALTY, extraattacks: 0, count: 0 },
    throwing: { tohit: 0 },
    twoweapon: {
      mainhandpenalty: CONSTANTS.TWO_WEAPON_MAIN_HAND_PENALTY,
      offhandpenalty: CONSTANTS.TWO_WEAPON_OFF_HAND_PENALTY,
      offhandattacks: 1,
    },
    grapple: { bab: 0, strength: 0, size: 0, misc: 0, total: 0 },
    speed: { base: CONSTANTS.DEFAULT_SPEED, misc: 0, total: CONSTANTS.DEFAULT_SPEED },
    encumbrance: {
      carriedweight: 0,
      lightload: 0,
      mediumload: 0,
      heavyload: 0,
      load: "light" as const,
      maxdex: Infinity,
      checkpenalty: 0,
    },
    armor: { category: "none" },
    shield: { held: false },
    weaponsets: {},
    armors: {},
    shields: {},
  };

  protected shieldMaxDex = Infinity;

  /** Whether a tower shield is carried: −2 on attack rolls, for its encumbrance. */
  protected towerShield = false;

  /** Whether a one-handed off-hand weapon counts as light in two-weapon fighting: Oversized Two-Weapon Fighting. */
  protected oversizedOffHand = false;

  /** Whether the race keeps its speed in medium or heavy armor and load (RACE_SPEED_IGNORES_ENCUMBRANCE: the dwarf). */
  protected speedIgnoresEncumbrance = false;

  protected characterSkills: SkillsComponent | null = null;

  protected characterEncumbrance: EncumbranceComponent | null = null;

  protected raceSize = "Medium";

  protected hitDiceOverride: number | null = null;

  /** Each level's hit die roll, which its Constitution modifier adds to. */
  protected hitDieRolls: number[] = [];

  /** Each weapon's abilities, which its to-hit and damage read: Weapon Finesse sets its finesse. */
  protected readonly weaponAbilities = new WeakMap<WeaponSlot, WeaponAbilities>();

  /** Each double weapon's other end's damage dice (its WEAPON_DOUBLE_DAMAGE). */
  protected readonly doubleWeapons = new WeakMap<WeaponSlot, string>();
}
