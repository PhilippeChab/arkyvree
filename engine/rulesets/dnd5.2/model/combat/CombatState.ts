import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { WeaponFields } from "@/engine/rulesets/dnd5.2/entities/items/fields.ts";
import type AbilitiesComponent from "@/engine/rulesets/dnd5.2/model/abilities/AbilitiesComponent.ts";
import type ClassesComponent from "@/engine/rulesets/dnd5.2/model/classes/ClassesComponent.ts";
import type IdentityComponent from "@/engine/rulesets/dnd5.2/model/identity/IdentityComponent.ts";
import type InventoryComponent from "@/engine/rulesets/dnd5.2/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import { COMBAT_RULES, type WORN_ARMOR_CATEGORIES } from "@/vocabulary/dnd5.2/combat.ts";

import type ArmorsComponent from "./ArmorsComponent.ts";
import type { ArmorsData } from "./ArmorsComponent.ts";
import type CarryingComponent from "./CarryingComponent.ts";
import type { CarryingData } from "./CarryingComponent.ts";
import type ShieldsComponent from "./ShieldsComponent.ts";
import type { ShieldsData, ShieldSlot } from "./ShieldsComponent.ts";

/** The category of the armor a character wears: none, or its armor's. */
type WornArmorCategory = (typeof WORN_ARMOR_CATEGORIES)[number];

/**
 * An Armor Class's parts: its base (10 unarmored, its armor's otherwise), the Dexterity modifier its armor lets it add,
 * its shield's bonus, and what modifiers add (`misc`: a Barbarian's Constitution unarmored, a ring's +1).
 */
export interface ArmorClassParts {
  readonly base: number;
  readonly dexterity: number;
  misc: number;
  shield: number;
}

/**
 * A character's combat sheet: its Armor Class, the armor it wears and the training it has with armor, the attacks it
 * makes in an Attack action, its Proficiency Bonus, its hit points, initiative, speed and what it carries, the critical
 * hit range of its attacks, and its weapon sets (each its hands' weapons, its shield and its Armor Class).
 */
export interface CombatData {
  ac: SharedArmorClass;
  armor: {
    readonly category: WornArmorCategory;
    /** Whether its wearer meets its Strength: without, its speed is 10 feet lower. */
    readonly strengthmet: boolean;
    /** Whether it has training with its armor's category: without, it can't cast spells. */
    readonly trained: boolean;
  };
  /** Training with each armor category and with shields, each a feat's to set. */
  armortraining: { heavy: boolean; light: boolean; medium: boolean; shields: boolean };
  armors: ArmorsData;
  /** The attacks it makes when it takes the Attack action: 1, more with Extra Attack. */
  attacks: number;
  carrying: CarryingData;
  /** How many rolls score a critical hit, the 20 and those under it: 1 = 20, 2 = 19–20 (a Champion's). */
  critical: { range: number };
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
  readonly proficiency: number;
  shield: { readonly held: boolean };
  shields: ShieldsData;
  speed: {
    base: number;
    misc: number;
    readonly total: number;
  };
  /** Whether its off-hand attack adds its ability modifier to damage: the Two-Weapon Fighting style. */
  twoweapon: { ability: boolean };
  weaponsets: Record<string, WeaponSet>;
}

/** A weapon the combat placed in a hand of a set, from an inventory entry. */
export interface HeldWeapon {
  fields: WeaponFields;
  location: string;
  setIndex: number;
  weapon: WeaponSlot;
}

/** A weapon set's Armor Class: its parts, its shield's own, and their total. */
export interface SetArmorClass extends ArmorClassParts {
  readonly total: number;
}

/** The sheet's Armor Class outside a weapon set: its parts, its shield's the best a set holds. */
export interface SharedArmorClass extends Omit<ArmorClassParts, "shield"> {
  readonly shield: number;
}

/** A loadout: its hands' weapons, its shield and its Armor Class. */
export interface WeaponSet {
  ac: SetArmorClass;
  mainhand: WeaponSlot | null;
  offhand: WeaponSlot | null;
  shield: { readonly held: boolean; readonly names: string[] };
  twohanded: WeaponSlot | null;
}

/**
 * A weapon in a hand: its attack (its ability's modifier, its Proficiency Bonus when proficient, its magic and misc)
 * and its damage (its dice, two-handed ones for a Versatile weapon in two hands, its ability's modifier, its magic and
 * misc), its properties, range and mastery, which it uses when its wielder has mastered its kind.
 */
export interface WeaponSlot {
  /** The ability its attack and damage add: Strength in melee, Dexterity at range, the better one with Finesse. */
  readonly ability: "Dexterity" | "Strength";
  damage: {
    /** Its ability's modifier, an off-hand attack's only when negative without Two-Weapon Fighting. */
    readonly ability: number;
    dice: string;
    magic: number;
    misc: number;
    readonly total: string;
    type: string;
  };
  entryId: string | null;
  itemId: string | null;
  /** Its mastery property, when its wielder has mastered its kind (`mastered`). */
  readonly mastery: string | null;
  mastered: boolean;
  name: string;
  properties: string[];
  proficient: boolean;
  range: { long: number; normal: number } | null;
  tohit: {
    readonly ability: number;
    magic: number;
    misc: number;
    readonly proficiency: number;
    readonly total: number;
  };
  /** How it's held: `mainhand`, `offhand` or `twohanded`. */
  wielded: WeaponHand;
}

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
    carrying: CarryingComponent,
    protected readonly inventory: InventoryComponent,
  ) {
    super();
    this.combat = CombatState.newSheet(classes, armors.getArmors(), shields.getShields(), carrying.getCarrying());
    this.shieldSets = shields.getShieldSets();
  }

  /** A new sheet, around the armors, the shields and what the character carries, as its components hold them. */
  private static newSheet(
    classes: ClassesComponent,
    armors: ArmorsData,
    shields: ShieldsData,
    carrying: CarryingData,
  ): CombatData {
    return {
      ac: { base: COMBAT_RULES.UNARMORED_AC_BASE, dexterity: 0, shield: 0, misc: 0 },
      armor: { category: "none", strengthmet: true, trained: true },
      armortraining: { light: false, medium: false, heavy: false, shields: false },
      armors,
      attacks: 1,
      carrying,
      critical: { range: 1 },
      hp: { base: 0, constitution: 0, misc: 0, total: 0 },
      initiative: { dexterity: 0, misc: 0, total: 0 },
      get proficiency() {
        return classes.getProficiencyBonus();
      },
      shield: { held: false },
      shields,
      speed: { base: COMBAT_RULES.DEFAULT_SPEED, misc: 0, total: COMBAT_RULES.DEFAULT_SPEED },
      twoweapon: { ability: false },
      weaponsets: {},
    };
  }

  /**
   * The sheet. Its sections that compute parts when read (armor class, hit points, initiative, speed) are placeholders
   * here, which the concerns replace when the character initializes; its armors, shields and carrying are their
   * components' own objects, so what changes them (a modifier) is what the sheet reads.
   */
  protected readonly combat: CombatData;

  /** The inventory's weapons the combat placed, in its order (`CombatComponent.initialize`). */
  protected readonly heldWeapons: HeldWeapon[] = [];

  /** Each weapon set's shields, by its key: the shields component's (`ShieldsComponent.getShieldSets`). */
  protected readonly shieldSets: Readonly<Record<string, ShieldSlot[]>>;

  /** A weapon set's Armor Class and shield (`WeaponSet`), which read its own: the armor class's concern makes them. */
  protected abstract defenseOf(setKey: string): Pick<WeaponSet, "ac" | "shield">;

  /** The weapon set of key `setKey` (stored from 0), made with its hands empty when the character has none there yet. */
  protected weaponSet(setKey: string): WeaponSet {
    this.combat.weaponsets[setKey] ??= { mainhand: null, offhand: null, twohanded: null, ...this.defenseOf(setKey) };
    return this.combat.weaponsets[setKey];
  }
}
