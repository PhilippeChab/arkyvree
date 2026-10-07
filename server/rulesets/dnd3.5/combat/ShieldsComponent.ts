import type CombatComponent from "@/server/rulesets/dnd3.5/combat/CombatComponent.ts";
import {
  ARMOR_CHECK_PENALTY,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
} from "@/shared/dnd3.5/properties/index.ts";
import type { Item, Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Grouping key (normalized) → shared ShieldSlot reference */
type ShieldsData = Record<string, ShieldSlot>;

type ShieldSlot = {
  name: string;
  itemId: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  spellfailure: number;
};

const SHIELD_GROUPING_PROPERTIES = [SHIELD_TYPE] as const;

export default class ShieldsComponent {
  constructor(private readonly combat: CombatComponent) {}

  private readonly shields: ShieldsData = {};

  getShields(): ShieldsData {
    return this.shields;
  }

  registerShield(item: Item, properties: Property[]): void {
    const shieldType = properties.find((p) => p.type === SHIELD_PROFICIENCY);
    if (!shieldType) return;

    const acBonus = Number(properties.find((p) => p.type === SHIELD_AC_BONUS)?.value ?? 0);
    let checkPenalty = Number(properties.find((p) => p.type === ARMOR_CHECK_PENALTY)?.value ?? 0);
    const spellFailure = Number(properties.find((p) => p.type === ITEM_SPELL_FAILURE)?.value ?? 0);

    const isMasterwork = properties.some((p) => p.type === ITEM_MASTERWORK && p.value === "true");
    if (isMasterwork) checkPenalty = Math.min(checkPenalty + 1, 0);

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

    const groupingValues: string[] = [];

    for (const prop of properties) {
      if ((SHIELD_GROUPING_PROPERTIES as readonly string[]).includes(prop.type)) {
        groupingValues.push(stripSeparators(prop.value));
      }
    }

    groupingValues.push(stripSeparators(item.name));

    for (const grouping of groupingValues) {
      if (!grouping) continue;
      this.shields[grouping] = shieldSlot;
    }

    this.combat.addShield(properties);
  }
}

export type { ShieldsData };
