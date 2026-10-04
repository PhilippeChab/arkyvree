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
  /** Dexterity for a projectile weapon, Strength for any other: the better of the two once Weapon Finesse applies. */
  attack: "Strength" | "Dexterity" | "Finesse";
  /** A bow's Mighty rating (0 for a plain bow), which caps its Strength bonus to damage; null for any other weapon. */
  bowMighty: number | null;
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

  protected characterSkills: DetailedCharacterSkills | null = null;

  protected characterEncumbrance: DetailedCharacterEncumbrance | null = null;

  protected raceSize = "Medium";

  protected hitDiceOverride: number | null = null;

  /** Each level's hit die roll, which its Constitution modifier adds to. */
  protected hitDieRolls: number[] = [];

  /** Each weapon's abilities, which its totals follow once the abilities' modifiers have applied. */
  protected readonly weaponAbilities = new WeakMap<WeaponSlot, WeaponAbilities>();
}
