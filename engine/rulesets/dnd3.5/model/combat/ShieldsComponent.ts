import { CharacterComponent } from "@/engine/core/character/index.ts";
import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type InventoryComponent from "@/engine/rulesets/dnd3.5/model/inventory/InventoryComponent.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { Item } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { MASTERWORK_CHECK_PENALTY_REDUCTION } from "@/vocabulary/dnd3.5/combat.ts";

interface ShieldSlot {
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  itemId: string;
  /** Its maximum Dexterity bonus to AC: a tower shield's, 99 (none) for the others, as an armor's */
  maxdex: number;
  name: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  spellfailure: number;
}

/** Grouping key (normalized) → shared ShieldSlot reference */
type ShieldsData = Record<string, ShieldSlot>;

/** The shields a character has equipped, under their types: the inventory's (`InventoryComponent.getEquipped`). */
export default class ShieldsComponent extends CharacterComponent<LoadedCharacterData> {
  constructor(private readonly inventory: InventoryComponent) {
    super();
  }

  private readonly shields: ShieldsData = {};

  /** Each shield the inventory has equipped, in its order. */
  override initialize() {
    for (const { entry, fields } of this.inventory.getEquipped())
      if (entry.item.type === "Shield") this.registerShield(entry.item, fields);
  }

  private registerShield(item: Item, fields: ItemFieldValues): void {
    if (fields.shield.proficiency === null) return;

    const acBonus = fields.shield.acBonus ?? 0;
    let checkPenalty = fields.checkPenalty ?? 0;
    const spellFailure = fields.spellFailure ?? 0;
    const maxDex = fields.maxDex ?? 99;

    if (fields.masterwork === true) checkPenalty = Math.min(checkPenalty + MASTERWORK_CHECK_PENALTY_REDUCTION, 0);

    const shieldSlot: ShieldSlot = {
      name: item.name,
      itemId: item.id,
      proficient: true,
      // Its AC's total is computed when read, from the bonus and what modifiers add
      ac: {
        bonus: acBonus,
        misc: 0,
        get total() {
          return this.bonus + this.misc;
        },
      },
      checkpenalty: checkPenalty,
      spellfailure: spellFailure,
      maxdex: maxDex,
    };

    // Under its type: a heavy wooden shield's `heavywooden`
    const grouping = fields.shield.type === null ? "" : stripSeparators(fields.shield.type);
    if (grouping) this.shields[grouping] = shieldSlot;
  }

  getShields(): ShieldsData {
    return this.shields;
  }
}

export type { ShieldsData };
