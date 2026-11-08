import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import { ITEM_FIELDS } from "@/engine/rulesets/dnd5/entities/items/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5/model/loading/DetailedCharacterDataLoader.ts";
import ItemPlacement from "@/engine/rulesets/dnd5/rules/ItemPlacement.ts";
import { include } from "@/lib/mixins.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd5/fields/index.ts";
import { UNARMED_STRIKE } from "@/vocabulary/dnd5/weapons.ts";

import CombatState, { type CombatData, type HeldWeapon } from "./CombatState.ts";
import { ArmorClass } from "./concerns/ArmorClass.ts";
import { Attacks } from "./concerns/Attacks.ts";
import { HitPoints } from "./concerns/HitPoints.ts";
import { InitiativeAndSpeed } from "./concerns/InitiativeAndSpeed.ts";

/** The unarmed strike's weapon: 1 bludgeoning damage, its attack proficient, every creature's. */
const UNARMED_FIELDS = {
  ...ITEM_FIELDS.defaults.weapon,
  damage: UNARMED_STRIKE.damage,
  damageType: UNARMED_STRIKE.damageType,
};

/**
 * A character's combat sheet: its Armor Class, hit points, initiative, attacks and speed, from its classes, its species
 * and what its inventory has equipped (its weapons in their sets, its armor and shields).
 */
class CombatComponent extends include(CombatState, ArmorClass, Attacks, HitPoints, InitiativeAndSpeed) {
  /**
   * The sheet from the character's levels (their hit points) and species (its speed), an unarmed strike in its first
   * set's main hand, then what its inventory has equipped.
   */
  override initialize({ levelHitPoints, species }: Pick<LoadedCharacterData, "levelHitPoints" | "species">) {
    const levels = Object.values(this.classes.getClasses()).flatMap((klass) =>
      klass.levels.map((level): StoredAdvancement => level.advancement),
    );

    this.initializeArmorClass();
    this.initializeHitPoints(levels.map((level) => levelHitPoints.get(level.id) ?? 0));
    this.initializeInitiative();
    this.initializeSpeed(species);

    this.addWeapon(0, "Main Hand", UNARMED_STRIKE.name, UNARMED_FIELDS, { entryId: null, itemId: null }, true);
    this.equipWeapons();
    // A set that holds only a Shield is a set too, whose Armor Class its Shield adds to
    for (const setKey of Object.keys(this.shieldSets)) this.weaponSet(setKey);
  }

  /**
   * The weapons the inventory has equipped (`InventoryComponent.getEquipped`), in its order: each in the hand of each
   * set that holds it, held (`heldWeapons`). Its armor and shields are their components'.
   */
  private equipWeapons(): void {
    for (const { entry, fields } of this.inventory.getEquipped()) {
      if (entry.item.fields[ITEM_TYPE] !== "Weapon" || !entry.location) continue;
      const held = { itemId: entry.item.id, entryId: entry.id };
      for (const setIndex of ItemPlacement.heldSets(entry)) {
        const weapon = this.addWeapon(setIndex, entry.location, entry.item.name, fields.weapon, held);
        if (weapon) this.heldWeapons.push({ fields: fields.weapon, location: entry.location, setIndex, weapon });
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
    return [...new Set(held.flatMap(({ entry }) => ItemPlacement.heldSets(entry).map(String)))];
  }
}

export default CombatComponent;
