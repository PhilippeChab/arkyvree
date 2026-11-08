import { describe, expect, test } from "bun:test";

import { readCategory, readCostInGold, readItems } from "@/tests/support/dnd5.2/references.ts";
import { ARMOR_DEFINITIONS, SHIELD_DEFINITION } from "@/vocabulary/dnd5.2/armor.ts";

describe("The Armor table", () => {
  test("gives each armor the SRD's category, Armor Class, Dexterity, Strength, Stealth, cost and weight", () => {
    const armors = readItems().filter((item) => item.armor_class && item.name !== "Shield");
    expect(Object.keys(ARMOR_DEFINITIONS).toSorted()).toEqual(armors.map((item) => item.name).toSorted());
    for (const item of armors) {
      const definition: Record<string, unknown> = { name: item.name, ...ARMOR_DEFINITIONS[item.name] };
      expect(definition).toEqual({
        name: item.name,
        category: readCategory(item, /^(Light|Medium|Heavy) Armor$/),
        armorClass: item.armor_class?.base,
        maxDex: item.armor_class?.dex_bonus ? (item.armor_class.max_bonus ?? null) : 0,
        strength: item.str_minimum,
        stealthDisadvantage: item.stealth_disadvantage,
        cost: readCostInGold(item),
        weight: item.weight,
      });
    }
  });

  test("gives the Shield its +2, its cost and its weight", () => {
    const shield = readItems().find((item) => item.name === "Shield");
    expect(
      shield && { armorClass: shield.armor_class?.base, cost: readCostInGold(shield), weight: shield.weight },
    ).toEqual({ ...SHIELD_DEFINITION });
  });
});
