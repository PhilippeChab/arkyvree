import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import { stripSeparators } from "@/shared/text.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd3.5/combat.ts";

import type CombatComponent from "./CombatComponent.ts";
import { type HeldWeapon, SLOT_MAP, type WeaponSlot } from "./CombatState.ts";

/** Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference */
type WeaponGroup = Record<string, WeaponSlot>;

/** Grouping key (normalized) → WeaponGroup */
type WeaponsData = Record<string, WeaponGroup>;

/**
 * The weapons a character holds, under each group the listing offers (`items.weapons.<group>`): the inventory's, as its
 * combat placed them (`CombatComponent.getHeldWeapons`), and an empty hand's unarmed strike.
 */
export default class WeaponsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly combat: CombatComponent) {
    super();
  }

  private readonly weapons: WeaponsData = {};

  /**
   * Each weapon the combat placed from the inventory, in its order, then the first set's main hand when it strikes
   * unarmed (no weapon there).
   */
  override initialize(): void {
    for (const held of this.combat.getHeldWeapons()) this.registerWeapon(held);

    // The first set's main hand, by its key
    const set0Mainhand = this.combat.getCombat().weaponsets["0"]?.mainhand;
    if (set0Mainhand?.name === UNARMED_STRIKE && set0Mainhand.itemId === null)
      this.registerUnarmedStrike("0_mainhand", set0Mainhand);
  }

  /**
   * A slot's unarmed strike (`items.weapons.unarmedstrike`), by its set and hand (`weaponKey`): the one a character
   * strikes with an empty hand, or a gauntlet's.
   */
  private registerUnarmedStrike(weaponKey: string, weapon: WeaponSlot): void {
    const unarmed = stripSeparators(UNARMED_STRIKE);
    if (!this.weapons[unarmed]) this.weapons[unarmed] = {};

    this.weapons[unarmed][weaponKey] = weapon;
  }

  /**
   * A held weapon under each group the listing offers: its type, its proficiency, and a gauntlet's unarmed strike. The
   * slot it filled is the one it's grouped by, though a later entry may have taken it since.
   */
  private registerWeapon({ fields: weapon, location, setIndex, weapon: weaponRef }: HeldWeapon): void {
    const slotKey = SLOT_MAP[location];
    if (!slotKey) return;

    const setKey = String(setIndex);
    const weaponKey = `${setKey}_${slotKey}`;
    const grouping = weapon.type === null ? "" : stripSeparators(weapon.type);
    if (grouping) {
      if (!this.weapons[grouping]) this.weapons[grouping] = {};

      this.weapons[grouping][weaponKey] = weaponRef;
    }

    if (weapon.proficiency !== null) {
      const profGrouping = stripSeparators(weapon.proficiency);
      if (profGrouping) {
        if (!this.weapons[profGrouping]) this.weapons[profGrouping] = {};

        this.weapons[profGrouping][weaponKey] = weaponRef;
      }
    }

    // RAW: a strike with a gauntlet is otherwise considered an unarmed attack.
    if (weapon.type === "Gauntlet") this.registerUnarmedStrike(weaponKey, weaponRef);
  }

  /**
   * Drops every group: a creature whose stat block replaces its weapon sets with its natural attacks holds none of the
   * weapons they had. Natural attacks aren't items, so no `items.weapons` path reaches them.
   */
  clearGroups(): void {
    for (const group of Object.keys(this.weapons)) delete this.weapons[group];
  }

  getWeapons(): WeaponsData {
    return this.weapons;
  }
}
