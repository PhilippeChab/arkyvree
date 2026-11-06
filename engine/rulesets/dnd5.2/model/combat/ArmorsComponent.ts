import { CharacterComponent } from "@/engine/core/character/index.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd5.2/entities/items/fields.ts";
import type InventoryComponent from "@/engine/rulesets/dnd5.2/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import type { Item } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";
import { ITEM_TYPE } from "@/vocabulary/dnd5.2/fields/index.ts";

/** An armor the character wears: its category, the Armor Class it gives, its cap on Dexterity, its Strength and Stealth. */
export interface ArmorSlot {
  /** Its Armor Class: its base (Chain Mail's 16) and what modifiers add (a +1 armor's), counted when read. */
  ac: { base: number; misc: number; readonly total: number };
  /** Its category, lowercased as the sheet's armor category reads: light, medium or heavy. */
  category: string;
  itemId: string;
  /** The most Dexterity modifier its wearer adds: none for heavy armor (0), all of it for light armor (null). */
  maxdex: number | null;
  name: string;
  stealthdisadvantage: boolean;
  /** The Strength score its wearer needs, or its speed is 10 feet lower: 0 for none. */
  strength: number;
}

/** Grouping key (its armor's type, normalized) → shared ArmorSlot reference */
type ArmorsData = Record<string, ArmorSlot>;

/** The armors a character has equipped, under their types: the inventory's (`InventoryComponent.getEquipped`). */
export default class ArmorsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly inventory: InventoryComponent) {
    super();
  }

  private readonly armors: ArmorsData = {};

  /** Each armor the inventory has equipped, in its order. */
  override initialize() {
    for (const { entry, fields } of this.inventory.getEquipped())
      if (entry.item.fields[ITEM_TYPE] === "Armor") this.registerArmor(entry.item, fields);
  }

  /** An armor under its type (Chain Mail's `chainmail`): one without a category isn't one the sheet wears. */
  private registerArmor(item: Item, fields: ItemFieldValues): void {
    const { armorClass, category, maxDex, stealthDisadvantage, strength, type } = fields.armor;
    if (category === null || type === null) return;
    this.armors[stripSeparators(type)] = {
      name: item.name,
      itemId: item.id,
      category: category.toLowerCase(),
      // Its Armor Class's total is computed when read, from its base and what modifiers add
      ac: {
        base: armorClass ?? 0,
        misc: 0,
        get total() {
          return this.base + this.misc;
        },
      },
      maxdex: maxDex,
      strength: strength ?? 0,
      stealthdisadvantage: stealthDisadvantage === true,
    };
  }

  getArmors(): ArmorsData {
    return this.armors;
  }
}

export type { ArmorsData };
