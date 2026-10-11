import { CharacterComponent } from "@/engine/core/character/index.ts";
import { type WeaponFields } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd3.5/model/identity/IdentityComponent.ts";
import type InventoryComponent from "@/engine/rulesets/dnd3.5/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import { type ARMOR_CATEGORIES, COMBAT_RULES } from "@/vocabulary/dnd3.5/combat.ts";

import type ArmorsComponent from "./ArmorsComponent.ts";
import type { ArmorsData } from "./ArmorsComponent.ts";
import type EncumbranceComponent from "./EncumbranceComponent.ts";
import type { EncumbranceData } from "./EncumbranceComponent.ts";
import type ShieldsComponent from "./ShieldsComponent.ts";
import type { ShieldsData, ShieldSlot } from "./ShieldsComponent.ts";

type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];

/**
 * An armor class's parts: its inputs (the base, the armor's and the shield's AC, natural armor, deflection, dodge,
 * misc, uncanny dodge), which modifiers change, and what's computed when read (Dexterity's bonus, the size's).
 */
export interface ArmorClassParts {
  armor: number;
  base: number;
  deflection: number;
  readonly dexterity: number;
  /** Dodge bonuses, and any other a flat-footed character loses with its Dexterity bonus */
  dodge: number;
  misc: number;
  natural: number;
  shield: number;
  readonly size: number;
  /** Keeps the Dexterity and dodge bonuses when flat-footed: uncanny dodge */
  uncannydodge: boolean;
}

export interface CombatData {
  /**
   * The armor class's parts every weapon set shares, read outside a set: a shield in any set counted (its AC, its
   * maximum Dexterity), and what modifiers add to every set's. Its totals are each set's (`WeaponSet.ac`).
   */
  ac: ArmorClassParts;
  /** The category of the heaviest armor worn, "none" without: what a class feature's speed or AC bonus may require */
  armor: { category: ArmorCategory };
  armors: ArmorsData;
  bab: number;
  encumbrance: EncumbranceData;
  grapple: {
    readonly bab: number;
    misc: number;
    readonly size: number;
    readonly strength: number;
    readonly total: number;
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
  /**
   * A creature's natural attacks: the penalty on its secondary ones (−5, −2 with Multiattack), the extra attacks its
   * primary natural weapon makes, each at −5 (an animal companion's Multiattack without three natural attacks), and how
   * many attacks it makes (two claws are two).
   */
  naturalattacks: { readonly count: number; extraattacks: number; secondarypenalty: number };
  /** Whether a shield is carried in any weapon set: the worst case, which the skills and the speed read */
  shield: { readonly held: boolean };
  shields: ShieldsData;
  speed: {
    base: number;
    misc: number;
    readonly total: number;
  };
  /** Other bonuses to attack with thrown weapons and slings, a melee weapon's thrown attack included: a halfling's +1. */
  throwing: { tohit: number };
  /** Two-weapon fighting: the penalty on each hand's attacks, and how many attacks the off hand makes. */
  twoweapon: {
    mainhandpenalty: number;
    offhandattacks: number;
    offhandpenalty: number;
  };
  weaponsets: Record<string, WeaponSet>;
}

/**
 * A weapon of the inventory as the combat placed it: its set, its hand as its entry's location names it, its fields and
 * the slot it filled, which a later entry may have taken since. What the weapons component groups.
 */
export interface HeldWeapon {
  fields: WeaponFields;
  location: string;
  setIndex: number;
  weapon: WeaponSlot;
}

/**
 * A weapon set's armor class: the parts every set shares and what modifiers add in it alone (a gate on the shield
 * held, an item it holds), its own shield's AC and Dexterity cap, and its totals: all its parts, touch AC (without the
 * armor, the shield and natural armor), and flat-footed AC (without the Dexterity and dodge bonuses, unless uncanny
 * dodge keeps them).
 */
export interface SetArmorClass extends ArmorClassParts {
  readonly flatfooted: number;
  readonly total: number;
  readonly touch: number;
}

/** How a weapon's attack and damage follow the character's abilities, which its totals are recomputed from. */
export interface WeaponAbilities {
  /** The ability it attacks with: Dexterity for a ranged weapon, Strength for a melee one (SRD). */
  attack: "Strength" | "Dexterity";
  /** Whether a Weapon Finesse feat lets it attack with Dexterity instead, when that's better. */
  finesse: boolean;
  /** Whether it takes a penalty to attack below that rating: a composite bow's, which has a WEAPON_MIGHTY, not a plain bow's. */
  ratingRequired: boolean;
  /** Its Mighty rating (0 without), when Strength adds to its damage up to it (a bow's "Rating"); null otherwise. */
  strengthRating: number | null;
}

/**
 * A loadout the character switches to: what each hand holds, its armor class, and whether its off hand holds a shield,
 * which its armor class, its attacks and its armor class's gates read.
 */
export interface WeaponSet {
  ac: SetArmorClass;
  mainhand: WeaponSlot | null;
  offhand: WeaponSlot | null;
  /** Whether its off hand holds a shield, and the names of those it holds: one, by the slots' rules. */
  shield: { readonly held: boolean; readonly names: string[] };
  twohanded: WeaponSlot | null;
}
export interface WeaponSlot {
  damage: {
    base: string;
    critical: {
      multiplier: number;
      range: number;
    };
    magic: number;
    misc: number;
    others: string[];
    readonly strength: number;
    strmultiplier: number | null;
    readonly total: string;
    types: string[];
  };
  /** The inventory entry holding it: an item held in two places (a dagger in each hand) is two entries. */
  entryId: string | null;
  finessable: boolean;
  itemId: string | null;
  /** A light weapon (the table's Tiny and Small): no extra Strength in two hands, lighter two-weapon penalties off hand. */
  light: boolean;
  name: string;
  /**
   * A natural attack's kind, null for a weapon: a primary one adds its whole Strength bonus to damage (one and a half
   * for a creature's only attack), a secondary one takes `combat.naturalattacks.secondarypenalty` to attack and adds half. Either
   * attacks once a round, whatever the base attack bonus.
   */
  natural: NaturalAttackKind | null;
  /**
   * A double weapon's other end, held in two hands: its attacks as a light off-hand weapon's, and its damage, its dice
   * with half the Strength bonus.
   */
  readonly offend: { damage: string; total: number[] } | null;
  proficient: boolean;
  range: number;
  /** A ranged weapon (thrown or projectile, not used in melee), which attacks with Dexterity. */
  ranged: boolean;
  reach: number;
  /** A melee weapon's attack when thrown, if it has a range increment: with Dexterity, as every ranged attack. */
  readonly thrown: { dexterity: number; total: number[] } | null;
  tohit: {
    /**
     * What the gear costs its attacks: the check penalty of the armor and shields worn without proficiency, a tower
     * shield's −2, and its own penalty in one hand (a crossbow's)
     */
    readonly gearpenalty: number;
    magic: number;
    misc: number;
    readonly size: number;
    readonly strength: number;
    /**
     * Its attacks: these parts, and what only some weapons take, read where it's written: a secondary natural attack's
     * `combat.naturalattacks.secondarypenalty`, a thrown weapon's or a sling's `combat.throwing.tohit`
     */
    readonly total: number[];
  };
  /**
   * Its attacks when its set holds an equipped weapon in each hand, or when it's a double weapon held in two hands: its
   * own and its thrown ones (if it has those), with two-weapon fighting's penalties, the off hand's as many as
   * `combat.twoweapon.offhandattacks`; a double weapon's main end's damage too, with its whole Strength bonus, not one
   * and a half.
   */
  readonly twoweapon: { damage?: string; thrown: number[] | null; total: number[] } | null;
  /** How it's held: `mainhand`, `offhand` or `twohanded`, one value per inventory entry */
  wielded: string;
}

/** A natural attack's kind: a primary one at its full attack bonus, a secondary one lower. */
export type NaturalAttackKind = "primary" | "secondary";

/** A hand of a weapon set, where it holds a weapon. */
export type WeaponHand = "mainhand" | "offhand" | "twohanded";

/** A weapon slot's label, as an item's location names it, to its place in the weapon set. */
export const SLOT_MAP: Record<string, WeaponHand> = {
  "Main Hand": "mainhand",
  "Off Hand": "offhand",
  "Two Handed": "twohanded",
};

/** How a weapon is held, as a path's values: its place in the set, labelled as an item's location names it. */
export const WIELDED_VALUES = Object.entries(SLOT_MAP).map(([label, value]) => ({ value, label }));

/** What a character's combat sheet holds, which its concerns (armor class, hit points, attacks…) compute. */
export default abstract class CombatState extends CharacterComponent<LoadedCharacterData> {
  constructor(
    protected readonly abilities: AbilitiesComponent,
    protected readonly classes: ClassesComponent,
    protected readonly identity: IdentityComponent,
    armors: ArmorsComponent,
    shields: ShieldsComponent,
    protected readonly encumbrance: EncumbranceComponent,
    protected readonly inventory: InventoryComponent,
  ) {
    super();
    this.combat = CombatState.newSheet(armors.getArmors(), shields.getShields(), encumbrance.getEncumbrance());
    this.shieldSets = shields.getShieldSets();
  }

  /** A new sheet, around the armors, the shields and the encumbrance the character's components hold. */
  private static newSheet(armors: ArmorsData, shields: ShieldsData, encumbrance: EncumbranceData): CombatData {
    return {
      ac: {
        base: COMBAT_RULES.DEFAULT_AC_BASE,
        armor: 0,
        shield: 0,
        dexterity: 0,
        natural: 0,
        deflection: 0,
        dodge: 0,
        size: 0,
        misc: 0,
        uncannydodge: false,
      },
      hp: { base: 0, constitution: 0, misc: 0, total: 0 },
      initiative: { dexterity: 0, misc: 0, total: 0 },
      bab: 0,
      naturalattacks: { secondarypenalty: COMBAT_RULES.SECONDARY_NATURAL_ATTACK_PENALTY, extraattacks: 0, count: 0 },
      throwing: { tohit: 0 },
      twoweapon: {
        mainhandpenalty: COMBAT_RULES.TWO_WEAPON_MAIN_HAND_PENALTY,
        offhandpenalty: COMBAT_RULES.TWO_WEAPON_OFF_HAND_PENALTY,
        offhandattacks: 1,
      },
      grapple: { bab: 0, strength: 0, size: 0, misc: 0, total: 0 },
      speed: { base: COMBAT_RULES.DEFAULT_SPEED, misc: 0, total: COMBAT_RULES.DEFAULT_SPEED },
      encumbrance,
      armor: { category: "none" },
      shield: { held: false },
      weaponsets: {},
      armors,
      shields,
    };
  }

  /**
   * The sheet. Its sections that compute parts when read (armor class, hit points, initiative, grapple, speed) are
   * placeholders here, which the concerns replace when the character initializes; its armors, shields and encumbrance
   * are their components' own objects, so what changes them (a modifier) is what the sheet reads.
   */
  protected readonly combat: CombatData;

  /** Each double weapon's other end's damage dice (its WEAPON_DOUBLE_DAMAGE). */
  protected readonly doubleWeapons = new WeakMap<WeaponSlot, string>();

  /** What modifiers add to the armor's and the shield's AC, beside the items' own: a modifier's write keeps its part. */
  protected readonly gearBonus = { armor: 0, shield: 0 };

  /** The inventory's weapons the combat placed, in its order (`CombatComponent.initialize`). */
  protected readonly heldWeapons: HeldWeapon[] = [];

  /** Each weapon set's shields, by its key: the shields component's (`ShieldsComponent.getShieldSets`). */
  protected readonly shieldSets: Readonly<Record<string, ShieldSlot[]>>;

  /** The weapon sets whose off hand holds a tower shield: −2 on their attack rolls, for its encumbrance. */
  protected readonly towerShieldSets = new Set<string>();

  /** Each weapon's abilities, which its to-hit and damage read: Weapon Finesse sets its finesse. */
  protected readonly weaponAbilities = new WeakMap<WeaponSlot, WeaponAbilities>();

  protected hitDiceOverride: number | null = null;

  /** Each level's hit die roll, which its Constitution modifier adds to. */
  protected hitDieRolls: number[] = [];

  /** Whether a one-handed off-hand weapon counts as light in two-weapon fighting: Oversized Two-Weapon Fighting. */
  protected oversizedOffHand = false;

  /** Whether the race keeps its speed in medium or heavy armor and load (RACE_SPEED_IGNORES_ENCUMBRANCE: the dwarf). */
  protected speedIgnoresEncumbrance = false;

  /** A weapon set's armor class and shield (`WeaponSet`), which read its own: the armor class's concern makes them. */
  protected abstract defenseOf(setKey: string): Pick<WeaponSet, "ac" | "shield">;

  /** The character's size, as its identity's race has it: a modifier on `identity.physiology.race.size` changes it. */
  protected get raceSize(): string {
    return this.identity.getIdentity().physiology.race.size;
  }

  /** The weapon set of key `setKey` (stored from 0), made with its hands empty when the character has none there yet. */
  protected weaponSet(setKey: string): WeaponSet {
    this.combat.weaponsets[setKey] ??= { mainhand: null, offhand: null, twohanded: null, ...this.defenseOf(setKey) };
    return this.combat.weaponsets[setKey];
  }
}
