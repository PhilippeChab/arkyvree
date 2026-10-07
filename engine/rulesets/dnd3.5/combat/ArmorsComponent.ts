import type { ItemFields } from "@/engine/rulesets/dnd3.5/module/index.ts";
import type { Item } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type CombatComponent from "./CombatComponent.ts";

/** Grouping key (normalized) → shared ArmorSlot reference */
type ArmorsData = Record<string, ArmorSlot>;

type ArmorSlot = {
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  itemId: string;
  maxdex: number;
  name: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  spellfailure: number;
};

export default class ArmorsComponent {
  constructor(private readonly combat: CombatComponent) {}

  private readonly armors: ArmorsData = {};

  getArmors(): ArmorsData {
    return this.armors;
  }

  registerArmor(item: Item, fields: ItemFields): void {
    if (fields.armor.proficiency === null) return;

    const acBonus = fields.armor.acBonus ?? 0;
    let checkPenalty = fields.checkPenalty ?? 0;
    const spellFailure = fields.spellFailure ?? 0;
    const maxDex = fields.maxDex ?? 99;

    if (fields.masterwork === true) checkPenalty = Math.min(checkPenalty + 1, 0);

    const armorSlot: ArmorSlot = {
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

    // Under its type: a full plate's `fullplate`
    const grouping = fields.armor.type === null ? "" : stripSeparators(fields.armor.type);
    if (grouping) this.armors[grouping] = armorSlot;

    this.combat.addArmor(fields);
  }
}

export type { ArmorsData };
