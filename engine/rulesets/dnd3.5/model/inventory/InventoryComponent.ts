import { CharacterComponent, type InventoryEntry } from "@/engine/core/character/index.ts";
import { ITEM_FIELDS, type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import InventorySlots from "@/engine/rulesets/dnd3.5/rules/InventorySlots.ts";
import ItemPlacement from "@/engine/rulesets/dnd3.5/rules/ItemPlacement.ts";

type InventoryData = Record<string, InventorySlotData> & {
  weaponsets: WeaponSetInventory;
};

type InventorySlotData = {
  fields: Record<string, string>;
} | null;

type WeaponSetInventory = Record<
  string,
  {
    mainhand: InventorySlotData;
    offhand: InventorySlotData;
    twohanded: InventorySlotData;
  }
>;

/** An item the character has equipped in a slot, with its fields: what its combat, armors and shields read. */
export interface EquippedEntry {
  entry: InventoryEntry;
  fields: ItemFieldValues;
}

/**
 * A character's inventory: its entries, and the field values of what each slot holds (a weapon set's hands, the other
 * equipment's slots). The items it has equipped in a slot (`getEquipped`) are what its combat holds and its armors and
 * shields list.
 */
export default class InventoryComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly equipped: EquippedEntry[] = [];

  private readonly inventory: InventoryData = {
    weaponsets: {},
  } as InventoryData;

  private rawItems: InventoryEntry[] = [];

  /** The entries, and each equipped one in a slot: what the slot holds, its field values, and the item with its fields. */
  override initialize({ inventory }: Pick<LoadedCharacterData, "inventory">) {
    this.rawItems = inventory;
    for (const entry of inventory) {
      if (!entry.equipped) continue;

      const slot = InventorySlots.getSlot(entry.item.type, entry.location);
      if (!slot) continue;

      const fields = Object.fromEntries(
        Object.entries(entry.item.values.fields).map(([field, values]) => [field, values.map(String).join(", ")]),
      );

      this.equipped.push({ entry, fields: ITEM_FIELDS.read(entry.item.values) });
      if (entry.item.type === "Weapon") {
        // Weapons go into each weapon set that holds them
        const slotKey = slot as "mainhand" | "offhand" | "twohanded";
        for (const set of ItemPlacement.heldSets(entry)) {
          const weaponSet = (this.inventory.weaponsets[String(set)] ??= {
            mainhand: null,
            offhand: null,
            twohanded: null,
          });
          weaponSet[slotKey] = { fields };
        }
      } else if (entry.item.type !== "Armor" && entry.item.type !== "Shield") {
        // Non-combat equipment goes into flat equipment slots; the armors and the shields list the armor and shields
        this.inventory[slot] = { fields };
      }
    }
  }

  /** The items the character has equipped in a slot, in its inventory's order, each with its fields. */
  getEquipped(): EquippedEntry[] {
    return this.equipped;
  }

  getFlatInventory(): InventoryEntry[] {
    return this.rawItems;
  }

  getInventory(): InventoryData {
    return this.inventory;
  }
}
