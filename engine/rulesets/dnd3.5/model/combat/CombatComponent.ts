import { ITEM_FIELDS } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";
import { include } from "@/lib/mixins.ts";
import { type CharacterLevel } from "@/shared/relations.ts";
import { UNARMED_STRIKE, UNARMED_STRIKE_STATS } from "@/vocabulary/dnd3.5/combat.ts";

import CombatState, { type CombatData, type HeldWeapon } from "./CombatState.ts";
import { ArmorClass } from "./concerns/ArmorClass.ts";
import { Attacks } from "./concerns/Attacks.ts";
import { HitPoints } from "./concerns/HitPoints.ts";
import { InitiativeAndSpeed } from "./concerns/InitiativeAndSpeed.ts";

/**
 * A character's combat sheet: its armor class, hit points, initiative, attacks and speed, from its classes, its race and
 * what its inventory has equipped (its weapons in their sets, its armor and shields).
 */
class CombatComponent extends include(CombatState, ArmorClass, Attacks, HitPoints, InitiativeAndSpeed) {
  /**
   * The sheet from the character's classes (its hit dice, its base attack bonus) and race (its speed), an unarmed strike
   * in its first set's main hand, then what its inventory has equipped.
   */
  override initialize({ klassLevelProperties, race }: Pick<LoadedCharacterData, "klassLevelProperties" | "race">) {
    const classes = this.classes.getClasses();
    const levels = Object.values(classes).reduce((acc, klass) => {
      for (const level of klass.levels) acc.push(level.characterLevel);

      return acc;
    }, [] as CharacterLevel[]);

    this.initializeArmorClass();
    this.initializeHitPoints(levels);
    this.initializeInitiative();
    this.initializeBaseAttackBonus(classes, klassLevelProperties);
    this.initializeGrapple();
    this.initializeSpeed(race);

    this.addWeapon(
      0,
      "Main Hand",
      { name: UNARMED_STRIKE },
      {
        ...ITEM_FIELDS.defaults.weapon,
        ...UNARMED_STRIKE_STATS,
        damageTypes: [...UNARMED_STRIKE_STATS.damageTypes],
      },
    );
    this.equipInventory();
  }

  /**
   * What the inventory has equipped (`InventoryComponent.getEquipped`), in its order: each weapon in its set's hand
   * (one without a proficiency fills none), held (`heldWeapons`), the armor worn, and each shield in its set's off hand
   * (the first set, for an entry stored without one).
   */
  private equipInventory(): void {
    for (const { entry, fields } of this.inventory.getEquipped()) {
      if (entry.item.type === "Weapon") {
        const setIndex = entry.weaponSet ?? 0;
        const location = entry.location as "Main Hand" | "Off Hand" | "Two Handed";
        const held = { itemId: entry.item.id, entryId: entry.id };
        const weapon = this.addWeapon(setIndex, location, entry.item, fields.weapon, held);
        if (weapon) this.heldWeapons.push({ fields: fields.weapon, location, setIndex, weapon });
      } else if (entry.item.type === "Armor") {
        // The sheet wears it: the heaviest worn slows the character down
        this.addArmor(fields);
      } else if (entry.item.type === "Shield") {
        // Its set carries it: a tower shield's bulk
        this.addShield(fields, String(entry.weaponSet ?? 0));
      }
    }
  }

  getCombat(): CombatData {
    return this.combat;
  }

  /** The inventory's weapons the combat placed, in its order, each with the slot it filled then. */
  getHeldWeapons(): HeldWeapon[] {
    return this.heldWeapons;
  }

  /** The keys of the weapon sets (stored from 0), the loadouts a character switches between: the first at least. */
  getSetKeys(): string[] {
    return Object.keys(this.combat.weaponsets);
  }

  /** The keys of the weapon sets whose hands hold an item (`itemId`): a shield's, a weapon's; none for an item worn elsewhere. */
  getSetsHolding(itemId: string): string[] {
    const held = this.inventory
      .getEquipped()
      .filter(({ entry }) => entry.item.id === itemId && ItemPlacement.isHand(entry.location));
    return [...new Set(held.map(({ entry }) => String(entry.weaponSet ?? 0)))];
  }
}

export default CombatComponent;
