import type DetailedCharacterCombat from "@/server/rulesets/dnd3.5/DetailedCharacterCombat.ts";
import { ARMOR_AC_BONUS, ARMOR_CHECK_PENALTY, ARMOR_MAX_DEX, ARMOR_PROFICIENCY, ARMOR_TYPE, ITEM_MASTERWORK, ITEM_SPELL_FAILURE } from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { TargetPath } from "@/shared/customization/target.ts";
import type { Item, Property } from "@/shared/relations.ts";
import { deriveSegmentLabels, stripSeparators } from "@/shared/utils.ts";

const NAVIGATABLE_ARMOR_PATHS = [
  { path: "ac.bonus", description: "Base AC bonus from armor", type: "number" as const },
  { path: "ac.misc", description: "Other bonuses to armor AC", type: "number" as const },
  { path: "ac.total", description: "Total AC from this armor", type: "number" as const, requirementOnly: true },
  { path: "checkpenalty", description: "Penalty to Str/Dex skill checks", type: "number" as const },
  { path: "spellfailure", description: "Arcane spell failure chance", type: "number" as const },
  { path: "maxdex", description: "Maximum Dexterity bonus to AC", type: "number" as const },
];

const SEGMENT_LABELS: Record<string, string> = {
  ac: "Armor Class",
  checkpenalty: "Check Penalty",
  spellfailure: "Spell Failure",
  maxdex: "Maximum Dexterity",
};

const ARMOR_GROUPING_PROPERTIES = [ARMOR_TYPE] as const;

type ArmorSlot = {
  name: string;
  ac: { bonus: number; misc: number; total: number };
  checkpenalty: number;
  spellfailure: number;
  maxdex: number;
};

// Grouping key (normalized) → shared ArmorSlot reference
type ArmorsData = Record<string, ArmorSlot>;

export type { ArmorsData };

export default class DetailedCharacterArmors {
  static getSegmentLabels(): Record<string, string> {
    return deriveSegmentLabels(NAVIGATABLE_ARMOR_PATHS, { armors: "Armors", ...SEGMENT_LABELS });
  }

  static generateTargetPaths(
    armorGroupings: string[],
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const grouping of armorGroupings) {
      for (const subPath of NAVIGATABLE_ARMOR_PATHS) {
        if ("requirementOnly" in subPath && subPath.requirementOnly && kind === "modifier") continue;
        paths.push({
          path: `items.armors.${grouping}.${subPath.path}`,
          category: "items",
          description: subPath.description,
          valueType: subPath.type,
          operators: kind === "modifier"
            ? ["add", "subtract", "multiply", "divide", "set"]
            : [
              "equal",
              "not_equal",
              "greater_than",
              "less_than",
              "greater_than_or_equal",
              "less_than_or_equal",
            ],
        });
      }
    }

    return paths;
  }

  private readonly armors: ArmorsData = {};

  constructor(
    private readonly characterCombat: DetailedCharacterCombat,
  ) {}

  registerArmor(
    item: Item,
    properties: Property[],
  ): void {
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
      ac: { bonus: acBonus, misc: 0, total: acBonus },
      checkpenalty: checkPenalty,
      spellfailure: spellFailure,
      maxdex: maxDex,
    };

    const groupingValues: string[] = [];

    for (const prop of properties) {
      if ((ARMOR_GROUPING_PROPERTIES as readonly string[]).includes(prop.type)) {
        groupingValues.push(stripSeparators(prop.value));
      }
    }

    groupingValues.push(stripSeparators(item.name));

    for (const grouping of groupingValues) {
      if (!grouping) continue;
      this.armors[grouping] = armorSlot;
    }

    this.characterCombat.addArmor(properties);
  }

  getArmors(): ArmorsData {
    return this.armors;
  }

  updateTotals(): void {
    const uniqueArmors = new Set(Object.values(this.armors));
    let totalArmorAc = 0;
    for (const armor of uniqueArmors) {
      armor.ac.total = armor.ac.bonus + armor.ac.misc;
      totalArmorAc += armor.ac.total;
    }
    this.characterCombat.getCombat().ac.armor = totalArmorAc;
    this.characterCombat.updateTotals();
  }
}
