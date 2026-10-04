import { CONSTANTS } from "@/server/rulesets/constants.ts";
import type { ArmorsData } from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type DetailedCharacterEncumbrance from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import type { EncumbranceData } from "@/server/rulesets/dnd3.5/DetailedCharacterEncumbrance.ts";
import type { ShieldsData } from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import type DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";

export type WeaponSlot = {
  name: string;
  itemId: string | null;
  proficient: boolean;
  finessable: boolean;
  /** A light weapon (the table's Tiny and Small): no extra Strength in two hands, lighter two-weapon penalties off hand. */
  light: boolean;
  /** A ranged weapon (thrown or projectile, not used in melee), which attacks with Dexterity. */
  ranged: boolean;
  range: number;
  reach: number;
  slot: string;
  tohit: {
    strength: number;
    magic: number;
    misc: number;
    size: number;
    total: number[];
  };
  /** A melee weapon's attack when thrown, if it has a range increment: with Dexterity, as every ranged attack. */
  thrown: { dexterity: number; total: number[] } | null;
  /**
   * Its attacks when its set holds an equipped weapon in each hand: its own and its thrown ones (if it has those), with
   * two-weapon fighting's penalties, the off hand's as many as `combat.twoweapon.offhandattacks`.
   */
  twoweapon: { total: number[]; thrown: number[] | null } | null;
  damage: {
    base: string;
    strength: number;
    magic: number;
    misc: number;
    others: string[];
    total: string;
    types: string[];
    strmultiplier: number | null;
    critical: {
      range: number;
      multiplier: number;
    };
  };
};

export type WeaponSet = {
  mainhand: WeaponSlot | null;
  offhand: WeaponSlot | null;
  twohanded: WeaponSlot | null;
};

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

/** A weapon slot's label, as an item's location names it, to its place in the weapon set. */
export const SLOT_MAP: Record<string, keyof WeaponSet> = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
};

export type DetailedCharacterComprehensiveCombat = {
  ac: {
    base: number;
    armor: number;
    shield: number;
    dexterity: number;
    natural: number;
    deflection: number;
    size: number;
    misc: number;
    total: number;
    touch: number;
    flatfooted: number;
  };
  hp: {
    base: number;
    constitution: number;
    misc: number;
    total: number;
  };
  initiative: {
    dexterity: number;
    misc: number;
    total: number;
  };
  bab: number;
  /** Two-weapon fighting: the penalty on each hand's attacks, and how many attacks the off hand makes. */
  twoweapon: {
    mainhand: number;
    offhand: number;
    offhandattacks: number;
  };
  grapple: {
    bab: number;
    strength: number;
    size: number;
    misc: number;
    total: number;
  };
  speed: {
    base: number;
    misc: number;
    total: number;
  };
  encumbrance: EncumbranceData;
  weaponsets: Record<string, WeaponSet>;
  armors: ArmorsData;
  shields: ShieldsData;
};

/** What a character's combat sheet holds, which its concerns (armor class, hit points, attacks…) compute. */
export default abstract class CombatState {
  constructor(
    protected readonly characterAbilities: DetailedCharacterAbilities,
    protected readonly characterClasses: DetailedCharacterClasses,
  ) {}

  protected readonly detailedCharacterCombat: DetailedCharacterComprehensiveCombat = {
    ac: {
      base: CONSTANTS.DEFAULT_AC_BASE,
      armor: 0,
      shield: 0,
      dexterity: 0,
      natural: 0,
      deflection: 0,
      size: 0,
      misc: 0,
      total: CONSTANTS.DEFAULT_AC_BASE,
      touch: CONSTANTS.DEFAULT_AC_BASE,
      flatfooted: CONSTANTS.DEFAULT_AC_BASE,
    },
    hp: {
      base: 0,
      constitution: 0,
      misc: 0,
      total: 0,
    },
    initiative: {
      dexterity: 0,
      misc: 0,
      total: 0,
    },
    bab: 0,
    twoweapon: {
      mainhand: CONSTANTS.TWO_WEAPON_MAIN_HAND_PENALTY,
      offhand: CONSTANTS.TWO_WEAPON_OFF_HAND_PENALTY,
      offhandattacks: 1,
    },
    grapple: {
      bab: 0,
      strength: 0,
      size: 0,
      misc: 0,
      total: 0,
    },
    speed: {
      base: CONSTANTS.DEFAULT_SPEED,
      misc: 0,
      total: CONSTANTS.DEFAULT_SPEED,
    },
    encumbrance: {
      carriedweight: 0,
      lightload: 0,
      mediumload: 0,
      heavyload: 0,
      load: "light" as const,
      maxdex: Infinity,
      checkpenalty: 0,
    },
    weaponsets: {},
    armors: {},
    shields: {},
  };

  protected shieldMaxDex = Infinity;

  protected hasSpeedReducingArmor = false;

  /** Whether the race keeps its speed in medium or heavy armor and load (RACE_SPEED_IGNORES_ENCUMBRANCE: the dwarf). */
  protected speedIgnoresEncumbrance = false;

  protected characterSkills: DetailedCharacterSkills | null = null;

  protected characterEncumbrance: DetailedCharacterEncumbrance | null = null;

  protected raceSize = "Medium";

  protected hitDiceOverride: number | null = null;

  /** Each level's hit die roll, which its Constitution modifier adds to. */
  protected hitDieRolls: number[] = [];

  /** Each weapon's abilities, which its totals follow once the abilities' modifiers have applied. */
  protected readonly weaponAbilities = new WeakMap<WeaponSlot, WeaponAbilities>();
}
