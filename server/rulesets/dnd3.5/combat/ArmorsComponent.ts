import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
} from "@/shared/dnd3.5/properties/index.ts";
import type { Item, Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import type CombatComponent from "./CombatComponent.ts";

/** Grouping key (normalized) → shared ArmorSlot reference */
type ArmorsData = Record<string, ArmorSlot>;

type ArmorSlot = {
  name: string;
  itemId: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  spellfailure: number;
  maxdex: number;
};

const ARMOR_GROUPING_PROPERTIES = [ARMOR_TYPE] as const;

export default class ArmorsComponent {
  constructor(private readonly combat: CombatComponent) {}

  private readonly armors: ArmorsData = {};

  getArmors(): ArmorsData {
    return this.armors;
  }

  registerArmor(item: Item, properties: Property[]): void {
    const armorType = properties.find((p) => p.type === ARMOR_PROFICIENCY);
    if (!armorType) return;

    const acBonus = Number(properties.find((p) => p.type === ARMOR_AC_BONUS)?.value ?? 0);
    let checkPenalty = Number(properties.find((p) => p.type === ARMOR_CHECK_PENALTY)?.value ?? 0);
    const spellFailure = Number(properties.find((p) => p.type === ITEM_SPELL_FAILURE)?.value ?? 0);
    const maxDex = Number(properties.find((p) => p.type === ARMOR_MAX_DEX)?.value ?? 99);

    const isMasterwork = properties.some((p) => p.type === ITEM_MASTERWORK && p.value === "true");
    if (isMasterwork) checkPenalty = Math.min(checkPenalty + 1, 0);

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

    const groupingValues: string[] = [];

    for (const prop of properties) {
      if ((ARMOR_GROUPING_PROPERTIES as readonly string[]).includes(prop.type))
        groupingValues.push(stripSeparators(prop.value));
    }

    for (const grouping of groupingValues) {
      if (!grouping) continue;
      this.armors[grouping] = armorSlot;
    }

    this.combat.addArmor(properties);
  }
}

export type { ArmorsData };
