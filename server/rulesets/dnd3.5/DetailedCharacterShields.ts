import type DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import { getNumericOperators } from "@/shared/customization/operators.ts";
import { deriveSegmentLabels, type TargetPath } from "@/shared/customization/target.ts";
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

const NAVIGATABLE_SHIELD_PATHS = [
  { path: "ac.bonus", description: "Base AC bonus from shield", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to shield AC", type: "number" as const },
  { path: "ac.total", description: "Total AC from this shield", type: "number" as const, requirementOnly: true },
  { path: "checkpenalty", description: "Penalty to Str/Dex skill checks", type: "number" as const },
  { path: "spellfailure", description: "Arcane spell failure chance", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  ac: "Armor Class",
  checkpenalty: "Check Penalty",
  spellfailure: "Spell Failure",
};

const SHIELD_GROUPING_PROPERTIES = [SHIELD_TYPE] as const;

type ShieldSlot = {
  name: string;
  itemId: string;
  /** Whether the character is proficient with it: without, its check penalty applies to attack rolls */
  proficient: boolean;
  ac: { bonus: number; misc: number; readonly total: number };
  checkpenalty: number;
  spellfailure: number;
};

// Grouping key (normalized) → shared ShieldSlot reference
type ShieldsData = Record<string, ShieldSlot>;

export type { ShieldsData };

export default class DetailedCharacterShields {
  constructor(private readonly characterCombat: DetailedCharacterCombat) {}

  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_SHIELD_PATHS, { shields: "Shields", ...SEGMENT_LABELS });
  }

  static generateTargetPaths(shieldGroupings: string[], kind: "modifier" | "requirement"): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of shieldGroupings) {
      for (const subPath of NAVIGATABLE_SHIELD_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `items.shields.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: getNumericOperators(kind),
        });
      }
    }

    return paths;
  }

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

    this.characterCombat.addShield(properties);
  }
}
