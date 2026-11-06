import { CharacterComponent, type InventoryEntry } from "@/engine/core/character/index.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd5.2/entities/items/fields.ts";
import type InventoryComponent from "@/engine/rulesets/dnd5.2/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import ItemPlacement from "@/engine/rulesets/dnd5.2/rules/ItemPlacement.ts";
import type { Item } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd5.2/fields/index.ts";

/** A Shield the character holds: the Armor Class it adds, its own (the SRD's +2) and what modifiers add (a +1 Shield). */
export interface ShieldSlot {
  ac: { bonus: number; misc: number; readonly total: number };
  itemId: string;
  name: string;
}

/** The shields the character holds, by the weapon set holding each */
type ShieldGroup = Record<string, ShieldSlot>;

type ShieldsData = Record<string, ShieldGroup>;

/**
 * The shields a character has equipped, the inventory's (`InventoryComponent.getEquipped`): each under one grouping
 * (`items.shields.shield` reaches them all: the SRD's Shields are of one kind), and in the weapon set whose off hand
 * holds it.
 */
export default class ShieldsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly inventory: InventoryComponent) {
    super();
  }

  /** Each weapon set's shields, by its key. */
  private readonly sets: Record<string, ShieldSlot[]> = {};

  private readonly shields: ShieldsData = {};

  /** Each shield the inventory has equipped, in its order, in each set that holds it. */
  override initialize() {
    for (const { entry, fields } of this.inventory.getEquipped())
      if (entry.item.fields[ITEM_TYPE] === "Shield") this.registerShield(entry, fields);
  }

  private registerShield(entry: InventoryEntry<Item>, fields: ItemFieldValues): void {
    const slot: ShieldSlot = {
      name: entry.item.name,
      itemId: entry.item.id,
      // Its total is computed when read, from its bonus and what modifiers add
      ac: {
        bonus: fields.shield.acBonus ?? 0,
        misc: 0,
        get total() {
          return this.bonus + this.misc;
        },
      },
    };
    const group = (this.shields.shield ??= {});
    for (const set of ItemPlacement.heldSets(entry)) {
      group[String(set)] = slot;
      (this.sets[String(set)] ??= []).push(slot);
    }
  }

  getShields(): ShieldsData {
    return this.shields;
  }

  /** Each weapon set's shields, by its key: the first a set holds is the one it uses. */
  getShieldSets(): Readonly<Record<string, ShieldSlot[]>> {
    return this.sets;
  }
}

export type { ShieldsData };
