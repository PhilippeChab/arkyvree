import type CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import { SLOT_MAP, type WeaponSet } from "@/server/rulesets/dnd3.5/combat/CombatState.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import type { WeaponProperty } from "@/server/rulesets/dnd3.5/types.ts";
import { WEAPON_PROFICIENCY, WEAPON_TYPE } from "@/shared/dnd3.5/properties/index.ts";
import type { Item } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference */
type WeaponGroup = Record<string, NonNullable<WeaponSet[keyof WeaponSet]>>;

/** Grouping key (normalized) → WeaponGroup */
type WeaponsData = Record<string, WeaponGroup>;

export default class WeaponsComponent {
  constructor(private readonly characterCombat: CombatComponent) {}

  private readonly weapons: WeaponsData = {};

  getWeapons(): WeaponsData {
    return this.weapons;
  }

  registerWeapon(setIndex: number, slot: string, item: Pick<Item, "name">, properties: WeaponProperty[] = []): void {
    const slotKey = SLOT_MAP[slot];
    if (!slotKey) return;

    const setKey = String(setIndex);
    const weaponRef = this.characterCombat.getCombat().weaponsets[setKey]?.[slotKey];
    if (!weaponRef) return;

    const weaponKey = `${setKey}_${slotKey}`;
    const weaponType = properties.find((p) => p.type === WEAPON_TYPE);
    const grouping = stripSeparators(weaponType?.value ?? item.name);
    if (!grouping) return;

    if (!this.weapons[grouping]) {
      this.weapons[grouping] = {};
    }
    this.weapons[grouping][weaponKey] = weaponRef;

    const proficiency = properties.find((p) => p.type === WEAPON_PROFICIENCY);
    if (proficiency) {
      const profGrouping = stripSeparators(proficiency.value);
      if (profGrouping) {
        if (!this.weapons[profGrouping]) {
          this.weapons[profGrouping] = {};
        }
        this.weapons[profGrouping][weaponKey] = weaponRef;
      }
    }

    // RAW: a strike with a gauntlet is otherwise considered an unarmed attack.
    if (weaponType?.value === "Gauntlet") {
      const unarmed = stripSeparators(UNARMED_STRIKE);
      if (!this.weapons[unarmed]) {
        this.weapons[unarmed] = {};
      }
      this.weapons[unarmed][weaponKey] = weaponRef;
    }
  }
}
