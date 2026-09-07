import type DetailedCharacterArmors from "@/server/rulesets/dnd3.5/DetailedCharacterArmors.ts";
import type DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import type DetailedCharacterShields from "@/server/rulesets/dnd3.5/DetailedCharacterShields.ts";
import type DetailedCharacterWeapons from "@/server/rulesets/dnd3.5/DetailedCharacterWeapons.ts";
import { getInventorySlot } from "@/server/rulesets/properties/index.ts";
import { type CharacterInventory, type Item, type Modifier, type Property, type Requirement } from "@/shared/relations.ts";

type InventorySlotData = {
  properties: Record<string, string>;
} | null;

type WeaponSetInventory = Record<string, {
  mainhand: InventorySlotData;
  offhand: InventorySlotData;
  twohanded: InventorySlotData;
}>;

export type DetailedCharacterComprehensiveInventory = Record<string, InventorySlotData> & {
  weaponsets: WeaponSetInventory;
};

type RawInventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    requirements: Requirement[];
  };
};

export default class DetailedCharacterInventory {
  private readonly detailedCharacterInventory: DetailedCharacterComprehensiveInventory = {
    weaponsets: {},
  } as DetailedCharacterComprehensiveInventory;

  private rawItems: RawInventoryEntry[] = [];

  constructor(
    private readonly characterCombat: DetailedCharacterCombat,
    private readonly characterWeapons: DetailedCharacterWeapons,
    private readonly characterArmors: DetailedCharacterArmors,
    private readonly characterShields: DetailedCharacterShields,
  ) {}

  initialize(
    inventory: RawInventoryEntry[],
  ) {
    this.rawItems = inventory;
    for (const entry of inventory) {
      if (!entry.equipped) {
        continue;
      }

      const slot = getInventorySlot(entry.item.type, entry.location);
      if (!slot) {
        continue;
      }

      const propertiesMap: Record<string, string> = {};
      for (const prop of entry.item.properties) {
        if (prop.type in propertiesMap) {
          propertiesMap[prop.type] += `, ${prop.value}`;
        } else {
          propertiesMap[prop.type] = prop.value;
        }
      }

      const isArmor = entry.item.type === "Armor";
      const isShield = entry.item.type === "Shield";
      const isWeapon = entry.item.type === "Weapon";

      if (isWeapon) {
        // Weapons go into weaponsets
        const setIndex = entry.weaponSet ?? 0;
        const setKey = String(setIndex);
        const slotKey = slot as "mainhand" | "offhand" | "twohanded";

        if (!this.detailedCharacterInventory.weaponsets[setKey]) {
          this.detailedCharacterInventory.weaponsets[setKey] = {
            mainhand: null,
            offhand: null,
            twohanded: null,
          };
        }

        this.detailedCharacterInventory.weaponsets[setKey][slotKey] = {
          properties: propertiesMap,
        };

        this.characterCombat.addWeapon(
          setIndex,
          entry.location as "Main Hand" | "Off Hand" | "Two Handed",
          entry.item,
          entry.item.properties,
          entry.item.id,
        );

        this.characterWeapons.registerWeapon(
          setIndex,
          entry.location as string,
          entry.item,
          entry.item.properties,
        );
      } else if (isArmor) {
        this.characterArmors.registerArmor(entry.item, entry.item.properties);
      } else if (isShield) {
        this.characterShields.registerShield(entry.item, entry.item.properties);
      } else {
        // Non-combat equipment goes into flat equipment slots
        this.detailedCharacterInventory[slot] = {
          properties: propertiesMap,
        };
      }
    }

    const set0Mainhand = this.characterCombat.getCombat().weaponsets["0"]?.mainhand;
    if (set0Mainhand?.name === "Unarmed Strike" && set0Mainhand.itemId === null) {
      this.characterWeapons.registerWeapon(
        0, "Main Hand",
        { name: "Unarmed Strike" } as unknown as Item,
      );
    }
  }

  getInventory() {
    return this.detailedCharacterInventory;
  }

  getFlatInventory() {
    return this.rawItems;
  }
}
