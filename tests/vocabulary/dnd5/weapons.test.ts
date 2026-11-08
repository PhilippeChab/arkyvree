import { describe, expect, test } from "bun:test";

import { readCategory, readCostInGold, readItems } from "@/tests/support/dnd5/references.ts";
import { WEAPON_DEFINITIONS } from "@/vocabulary/dnd5/weapons.ts";

describe("The Weapons table", () => {
  test("gives each weapon the SRD's damage, properties, range, mastery, cost and weight, as its corrected item does", () => {
    const weapons = readItems().filter((item) => item.damage);
    expect(Object.keys(WEAPON_DEFINITIONS).toSorted()).toEqual(weapons.map((item) => item.name).toSorted());
    for (const item of weapons) {
      const range = item.range?.long ? item.range : item.throw_range;
      const definition: Record<string, unknown> = { name: item.name, ...WEAPON_DEFINITIONS[item.name] };
      expect(definition).toEqual({
        name: item.name,
        category: readCategory(item, /^(Simple|Martial) /),
        ranged: readCategory(item, /(Ranged) Weapons$/) !== undefined,
        damage: item.damage?.damage_dice,
        damageType: item.damage?.damage_type.name,
        properties: (item.properties ?? []).map((property) => property.name),
        mastery: item.mastery?.name,
        cost: readCostInGold(item),
        weight: item.weight ?? 0,
        ...(range ? { range: { normal: range.normal, long: range.long } } : {}),
        ...(item.two_handed_damage ? { versatile: item.two_handed_damage.damage_dice } : {}),
      });
    }
  });
});
