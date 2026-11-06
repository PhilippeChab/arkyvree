import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import type { ItemSeeds } from "@/codegen/pf1/tools/seeds/ItemSeeds.ts";
import type { ItemReference } from "@/codegen/pf1/tools/types/items.ts";
import { exotic, LIGHT_ARMOR_PROF, TOWER_SHIELD_PROF } from "@/content/pf1/builders/items/proficiencies.ts";
import { ARMOR_TYPE_DEFINITIONS, ARMOR_TYPE_NAMES, SHIELD_TYPE_NAMES } from "@/vocabulary/pf1/armor.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import {
  ARMOR_AC_BONUS,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  WEAPON_TYPE,
} from "@/vocabulary/pf1/fields/index.ts";
import { WEAPON_TYPE_DEFINITIONS, WEAPON_TYPE_NAMES } from "@/vocabulary/pf1/weapons.ts";

/** The Core Rulebook's item reference. */
function reference(): ItemReference {
  const ref = new BookSeeds(CORE_BOOK).reference("item");
  if (!ref) throw new Error("The Core Rulebook has no item reference");
  return ref;
}

/** The Core Rulebook's item seeds. */
function seeds(): ItemSeeds {
  return new BookSeeds(CORE_BOOK).items(reference());
}

/**
 * A table's row's medium damage and critical, as its page writes them: "1d8 (small), 1d10 (medium)", a double
 * weapon's "1d8/1d6 (medium)"; "19-20/x2", "x3", a double weapon's "x3/x4" (its first end's).
 */
function tableStats(fields: Record<string, string>) {
  const damage = fields.Damage?.match(/([\dd/]+) \(medium\)/)?.[1] ?? fields.Damage;
  const critical = (fields.Critical ?? "").match(/^(?:(\d+)[-–]20\/)?[x×](\d)(?:\/[x×]\d)?$/);
  return { damage, range: 21 - Number(critical?.[1] ?? 20), multiplier: Number(critical?.[2]) };
}

describe("An item reference's weapons, armor and shields", () => {
  test("are every one of the vocabulary's tables, each a template", () => {
    const { simpleWeapons, martialWeapons, exoticWeapons, armor, shields } = seeds().seeds();
    const weapons = [...simpleWeapons, ...martialWeapons, ...exoticWeapons];
    expect(weapons.map(({ name }) => name).toSorted()).toEqual(WEAPON_TYPE_NAMES);
    expect(armor.map(({ name }) => name).toSorted()).toEqual(ARMOR_TYPE_NAMES);
    expect(shields.map(({ name }) => name).toSorted()).toEqual(SHIELD_TYPE_NAMES);
    expect([...weapons, ...armor, ...shields].every(({ fields }) => fields[ITEM_IS_TEMPLATE])).toBe(true);
  });

  test("are filed and required by their proficiency, priced and weighed as their book does", () => {
    const { exoticWeapons, armor, shields } = seeds().seeds();
    const bastardSword = exoticWeapons.find(({ name }) => name === "Bastard Sword");
    expect(bastardSword?.requirements).toEqual(exotic("Bastard Sword"));
    expect(bastardSword?.fields).toMatchObject({
      [ITEM_COST_GP]: 35,
      [ITEM_WEIGHT]: 6,
      [WEAPON_TYPE]: "Bastard Sword",
    });
    expect(armor.find(({ name }) => name === "Chain Shirt")).toMatchObject({
      requirements: LIGHT_ARMOR_PROF,
      fields: { [ITEM_COST_GP]: 100, [ITEM_WEIGHT]: 25, [ITEM_TYPE]: "Armor", [ITEM_SLOT]: "Armor" },
    });
    expect(shields.find(({ name }) => name === "Tower Shield")?.requirements).toEqual(TOWER_SHIELD_PROF);
  });

  test("are as the book's tables state them: the vocabulary's damage, critical and armor bonus are their pages'", () => {
    const rows = reference().raw;
    // A weapon of no damage (a net's "—") has no damage to compare
    const weaponRows = rows.filter(({ category, fields }) => category === "weapon" && /^\d/.test(fields.Damage ?? ""));
    const { simpleWeapons, martialWeapons, exoticWeapons } = seeds().seeds();
    const mismatches = [...simpleWeapons, ...martialWeapons, ...exoticWeapons].flatMap(({ name }) => {
      const row = weaponRows.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
      const def = WEAPON_TYPE_DEFINITIONS[name]!;
      const stats = row && tableStats(row.fields);
      const damage = def.doubleDamage ? `${def.baseDamage}/${def.doubleDamage}` : def.baseDamage;
      const expected = { damage, range: def.criticalRange, multiplier: def.criticalMultiplier };
      return stats && JSON.stringify(stats) !== JSON.stringify(expected) ? [`${name}: ${JSON.stringify(stats)}`] : [];
    });
    expect(mismatches).toEqual([]);
    for (const armor of seeds().seeds().armor) {
      const row = rows.find(
        (entry) => entry.category === "armor" && armor.name.toLowerCase().startsWith(entry.name.toLowerCase()),
      );
      expect(Number(row?.fields["Armor Bonus"])).toBe(ARMOR_TYPE_DEFINITIONS[armor.name]!.acBonus);
      expect(armor.fields[ARMOR_AC_BONUS]).toBe(ARMOR_TYPE_DEFINITIONS[armor.name]!.acBonus);
    }
  });

  test("leave out what's no item a character wields or wears: ammunition, siege engines, armor extras", () => {
    const leftOut = seeds().leftOut();
    expect(leftOut).toContain("weapon: Arrows (20)");
    expect(leftOut).toContain("weapon: Ballista, light");
    expect(leftOut).toContain("weapon: Unarmed strike");
    expect(leftOut).toContain("armor: Armor spikes");
    expect(leftOut.some((row) => /Longsword/.test(row))).toBe(false);
  });
});

describe("An item reference's goods", () => {
  test("are a seed per variant its book lists, each priced and weighed as its line gives that variant", () => {
    const { goods } = seeds().seeds();
    expect(
      goods
        .filter(({ name }) => name.startsWith("Ale "))
        .map(({ name, fields }) => [name, fields[ITEM_COST_GP], fields[ITEM_WEIGHT]]),
    ).toEqual([
      ["Ale (gallon)", 0.2, 8],
      ["Ale (mug)", 0.04, 1],
    ]);
    expect(goods.find(({ name }) => name === "Acid")?.fields).toEqual({
      [ITEM_COST_GP]: 10,
      [ITEM_WEIGHT]: 1,
      [ITEM_TYPE]: "Other",
      [ITEM_SLOT]: "Other",
    });
  });

  test("have names no two of them share", () => {
    const names = seeds()
      .seeds()
      .goods.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
  });
});
