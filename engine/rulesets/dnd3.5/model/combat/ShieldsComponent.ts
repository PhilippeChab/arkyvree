import { type ItemFieldValues } from "@/engine/rulesets/dnd3.5/entities/items/fields.ts";
import type { Item } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Grouping key (normalized) → shared ShieldSlot reference */
type ShieldsData = Record<string, ShieldSlot>;

type ShieldSlot = {
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  itemId: string;
  name: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  spellfailure: number;
};

export default class ShieldsComponent {
  private readonly shields: ShieldsData = {};

  getShields(): ShieldsData {
    return this.shields;
  }

  registerShield(item: Item, fields: ItemFieldValues): void {
    if (fields.shield.proficiency === null) return;

    const acBonus = fields.shield.acBonus ?? 0;
    let checkPenalty = fields.checkPenalty ?? 0;
    const spellFailure = fields.spellFailure ?? 0;

    if (fields.masterwork === true) checkPenalty = Math.min(checkPenalty + 1, 0);

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
    };

    // Under its type: a heavy wooden shield's `heavywooden`
    const grouping = fields.shield.type === null ? "" : stripSeparators(fields.shield.type);
    if (grouping) this.shields[grouping] = shieldSlot;
  }
}

export type { ShieldsData };
