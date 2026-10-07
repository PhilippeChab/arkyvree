import { UNARMED_STRIKE } from "@/engine/rulesets/dnd3.5/constants.ts";
import type { WeaponFields } from "@/engine/rulesets/dnd3.5/items/itemFields.ts";
import { stripSeparators } from "@/shared/text.ts";

import type CombatComponent from "./CombatComponent.ts";
import { SLOT_MAP, type WeaponSet } from "./CombatState.ts";

/** Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference */
type WeaponGroup = Record<string, NonNullable<WeaponSet[keyof WeaponSet]>>;

/** Grouping key (normalized) → WeaponGroup */
type WeaponsData = Record<string, WeaponGroup>;

export default class WeaponsComponent {
  constructor(private readonly combat: CombatComponent) {}

  private readonly weapons: WeaponsData = {};

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

  /** A slot's unarmed strike (`items.weapons.unarmedstrike`): the one a character strikes with an empty hand, or a gauntlet's. */
  registerUnarmedStrike(setIndex: number, slot: string): void {
    const slotKey = SLOT_MAP[slot];
    const setKey = String(setIndex);
    const weaponRef = slotKey ? this.combat.getCombat().weaponsets[setKey]?.[slotKey] : undefined;
    if (!weaponRef) return;
    const unarmed = stripSeparators(UNARMED_STRIKE);
    if (!this.weapons[unarmed]) this.weapons[unarmed] = {};

    this.weapons[unarmed][`${setKey}_${slotKey}`] = weaponRef;
  }

  /** A slot's weapon under each group the listing offers: its type, its proficiency, and a gauntlet's unarmed strike. */
  registerWeapon(setIndex: number, slot: string, weapon: WeaponFields): void {
    const slotKey = SLOT_MAP[slot];
    if (!slotKey) return;

    const setKey = String(setIndex);
    const weaponRef = this.combat.getCombat().weaponsets[setKey]?.[slotKey];
    if (!weaponRef) return;

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
    if (weapon.type === "Gauntlet") this.registerUnarmedStrike(setIndex, slot);
  }
}
