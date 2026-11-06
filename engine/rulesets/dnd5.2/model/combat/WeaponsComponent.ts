import { CharacterComponent } from "@/engine/core/character/index.ts";
import type CombatComponent from "@/engine/rulesets/dnd5.2/model/combat/CombatComponent.ts";
import { SLOT_MAP, type WeaponSlot } from "@/engine/rulesets/dnd5.2/model/combat/CombatState.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import { stripSeparators } from "@/shared/text.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd5.2/weapons.ts";

/** Record of weapon key ("setIndex_slotKey") → shared WeaponSlot reference */
type WeaponGroup = Record<string, WeaponSlot>;

/** Grouping key (normalized) → WeaponGroup */
type WeaponsData = Record<string, WeaponGroup>;

/**
 * The weapons a character holds, under each group the listing offers (`items.weapons.<group>`): its kind (`longsword`)
 * and its category (`martial`), the inventory's, as its combat placed them (`CombatComponent.getHeldWeapons`), and an
 * empty hand's unarmed strike. A proficiency or a mastery a feat gives is a modifier on a group: every weapon of it.
 */
export default class WeaponsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly combat: CombatComponent) {
    super();
  }

  private readonly weapons: WeaponsData = {};

  /** A weapon slot under a group, by its set and hand (`weaponKey`). */
  private group(grouping: string, weaponKey: string, weapon: WeaponSlot): void {
    if (grouping) (this.weapons[grouping] ??= {})[weaponKey] = weapon;
  }

  /**
   * Each weapon the combat placed from the inventory, in its order, under its kind and its category, then the first
   * set's main hand when it strikes unarmed (no weapon there).
   */
  override initialize(): void {
    for (const { fields, location, setIndex, weapon } of this.combat.getHeldWeapons()) {
      const weaponKey = `${setIndex}_${SLOT_MAP[location]}`;
      this.group(stripSeparators(fields.type ?? ""), weaponKey, weapon);
      this.group(stripSeparators(fields.category ?? ""), weaponKey, weapon);
    }

    const mainhand = this.combat.getCombat().weaponsets["0"]?.mainhand;
    if (mainhand?.name === UNARMED_STRIKE.name && mainhand.itemId === null)
      this.group(stripSeparators(UNARMED_STRIKE.name), "0_mainhand", mainhand);
  }

  getWeapons(): WeaponsData {
    return this.weapons;
  }
}
