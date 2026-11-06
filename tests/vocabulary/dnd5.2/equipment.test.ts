import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd5.2/tools/references/References.ts";
import type { ItemEntry } from "@/codegen/dnd5.2/tools/types/items.ts";
import { ARMOR_DEFINITIONS, SHIELD_ARMOR_CLASS } from "@/vocabulary/dnd5.2/armor.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5.2/books.ts";
import { WEAPON_DEFINITIONS } from "@/vocabulary/dnd5.2/weapons.ts";

/** What `pattern` reads off an item's equipment categories ("Martial Melee Weapons": Martial), if any names it. */
function categoryOf(item: ItemEntry, pattern: RegExp): string | undefined {
  return item.equipment_categories.map((category) => pattern.exec(category.name)?.[1]).find(Boolean);
}

/** The book's equipment, each item with its overrides in place of the database's fields. */
function items(): ItemEntry[] {
  const { overrides, raw } = References.load(References.path(CORE_BOOK, "item"), "item");
  return raw.map((item) => ({ ...item, ...overrides?.[item.name] }));
}

describe("The equipment's tables", () => {
  test("give each weapon the SRD's damage, properties, range and mastery, as the database does once corrected", () => {
    const weapons = items().filter((item) => item.damage);
    expect(Object.keys(WEAPON_DEFINITIONS).toSorted()).toEqual(weapons.map((item) => item.name).toSorted());
    for (const item of weapons) {
      const range = item.range?.long ? item.range : item.throw_range;
      const definition: Record<string, unknown> = { name: item.name, ...WEAPON_DEFINITIONS[item.name] };
      expect(definition).toEqual({
        name: item.name,
        category: categoryOf(item, /^(Simple|Martial) /),
        ranged: categoryOf(item, /(Ranged) Weapons$/) !== undefined,
        damage: item.damage?.damage_dice,
        damageType: item.damage?.damage_type.name,
        properties: (item.properties ?? []).map((property) => property.name),
        mastery: item.mastery?.name,
        ...(range ? { range: { normal: range.normal, long: range.long } } : {}),
        ...(item.two_handed_damage ? { versatile: item.two_handed_damage.damage_dice } : {}),
      });
    }
  });

  test("give each armor the SRD's category, Armor Class, Dexterity, Strength and Stealth, and a Shield its +2", () => {
    const armors = items().filter((item) => item.armor_class && item.name !== "Shield");
    expect(Object.keys(ARMOR_DEFINITIONS).toSorted()).toEqual(armors.map((item) => item.name).toSorted());
    for (const item of armors) {
      const definition: Record<string, unknown> = { name: item.name, ...ARMOR_DEFINITIONS[item.name] };
      expect(definition).toEqual({
        name: item.name,
        category: categoryOf(item, /^(Light|Medium|Heavy) Armor$/),
        armorClass: item.armor_class?.base,
        maxDex: item.armor_class?.dex_bonus ? (item.armor_class.max_bonus ?? null) : 0,
        strength: item.str_minimum,
        stealthDisadvantage: item.stealth_disadvantage,
      });
    }
    expect(items().find((item) => item.name === "Shield")?.armor_class?.base).toBe(SHIELD_ARMOR_CLASS);
  });
});
