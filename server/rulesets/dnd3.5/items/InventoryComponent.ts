import type ArmorsComponent from "@/server/rulesets/dnd3.5/combat/ArmorsComponent.ts";
import type CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import type ShieldsComponent from "@/server/rulesets/dnd3.5/combat/ShieldsComponent.ts";
import type WeaponsComponent from "@/server/rulesets/dnd3.5/combat/WeaponsComponent.ts";
import { UNARMED_STRIKE } from "@/server/rulesets/dnd3.5/constants.ts";
import {
  type CharacterInventory,
  type Item,
  type Modifier,
  type Property,
  type Requirement,
} from "@/shared/relations.ts";

import { getInventorySlot } from "./slots.ts";

type InventoryData = Record<string, InventorySlotData> & {
  weaponsets: WeaponSetInventory;
};

type InventorySlotData = {
  properties: Record<string, string>;
} | null;

type RawInventoryEntry = CharacterInventory & {
  item: Item & {
    properties: Property[];
    modifiers: Modifier[];
    requirements: Requirement[];
  };
};

type WeaponSetInventory = Record<
  string,
  {
    mainhand: InventorySlotData;
    offhand: InventorySlotData;
    twohanded: InventorySlotData;
  }
>;

export default class InventoryComponent {
  constructor(
    private readonly combat: CombatComponent,
    private readonly weapons: WeaponsComponent,
    private readonly armors: ArmorsComponent,
    private readonly shields: ShieldsComponent,
  ) {}

  private readonly inventory: InventoryData = {
    weaponsets: {},
  } as InventoryData;

  private rawItems: RawInventoryEntry[] = [];

  getFlatInventory() {
    return this.rawItems;
  }

  getInventory() {
    return this.inventory;
  }

  initialize(inventory: RawInventoryEntry[]) {
    this.rawItems = inventory;
    for (const entry of inventory) {
      if (!entry.equipped) continue;

      const slot = getInventorySlot(entry.item.type, entry.location);
      if (!slot) continue;

      const propertiesMap: Record<string, string> = {};
      for (const prop of entry.item.properties) {
        if (prop.type in propertiesMap) propertiesMap[prop.type] += `, ${prop.value}`;
        else propertiesMap[prop.type] = prop.value;
      }

      const isArmor = entry.item.type === "Armor";
      const isShield = entry.item.type === "Shield";
      const isWeapon = entry.item.type === "Weapon";

      if (isWeapon) {
        // Weapons go into weaponsets
        const setIndex = entry.weaponSet ?? 0;
        const setKey = String(setIndex);
        const slotKey = slot as "mainhand" | "offhand" | "twohanded";

        if (!this.inventory.weaponsets[setKey]) {
          this.inventory.weaponsets[setKey] = {
            mainhand: null,
            offhand: null,
            twohanded: null,
          };
        }

        this.inventory.weaponsets[setKey][slotKey] = {
          properties: propertiesMap,
        };

        const weapon = this.combat.addWeapon(
          setIndex,
          entry.location as "Main Hand" | "Off Hand" | "Two Handed",
          entry.item,
          entry.item.properties,
          { itemId: entry.item.id, entryId: entry.id },
        );

        // A weapon without a proficiency fills no slot: what the slot holds (an empty hand's unarmed strike) isn't it
        if (weapon) this.weapons.registerWeapon(setIndex, entry.location as string, entry.item.properties);
      } else if (isArmor) {
        this.armors.registerArmor(entry.item, entry.item.properties);
      } else if (isShield) {
        this.shields.registerShield(entry.item, entry.item.properties);
      } else {
        // Non-combat equipment goes into flat equipment slots
        this.inventory[slot] = {
          properties: propertiesMap,
        };
      }
    }

    const set0Mainhand = this.combat.getCombat().weaponsets["0"]?.mainhand;
    if (set0Mainhand?.name === UNARMED_STRIKE && set0Mainhand.itemId === null)
      this.weapons.registerUnarmedStrike(0, "Main Hand");
  }
}
