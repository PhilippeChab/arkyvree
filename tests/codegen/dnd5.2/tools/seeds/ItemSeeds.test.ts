import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd5.2/tools/references/References.ts";
import { ItemSeeds } from "@/codegen/dnd5.2/tools/seeds/ItemSeeds.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5.2/books.ts";
import {
  ITEM_IS_TEMPLATE,
  WEAPON_DAMAGE,
  WEAPON_MASTERY,
  WEAPON_VERSATILE_DAMAGE,
} from "@/vocabulary/dnd5.2/fields/index.ts";

/** The book's items' seeds. */
function readItems() {
  return new ItemSeeds(References.load(References.path(CORE_BOOK, "item"), "item"));
}

describe("The SRD 5.2.1's equipment, as the generator reads it", () => {
  test("makes its weapons, armor and Shield templates, their fields the Weapons and Armor tables'", () => {
    const { armor, martialWeapons, shields, simpleWeapons } = readItems().seeds();
    expect([simpleWeapons.length, martialWeapons.length, armor.length, shields.length]).toEqual([14, 24, 12, 1]);
    for (const item of [...simpleWeapons, ...martialWeapons, ...armor, ...shields])
      expect({ name: item.name, template: item.fields[ITEM_IS_TEMPLATE] }).toEqual({ name: item.name, template: true });
    // Its overrides': the SRD's Trident, and Half Plate Armor's name
    expect(martialWeapons.find(({ name }) => name === "Trident")?.fields).toMatchObject({
      [WEAPON_DAMAGE]: "1d8",
      [WEAPON_VERSATILE_DAMAGE]: "1d10",
      [WEAPON_MASTERY]: "Topple",
    });
    expect(armor.map(({ name }) => name)).toContain("Half Plate Armor");
  });

  test("names its tools, each a feat in the pool of every tool's and in each pool of tools that offers it", () => {
    const items = readItems();
    expect(items.tools()).toEqual(expect.arrayContaining(["Thieves' Tools", "Dice", "Disguise Kit", "Lute"]));
    expect(items.seeds().tools.map(({ name }) => name)).toEqual(expect.arrayContaining(items.tools()));
    const feats = items.toolFeats([{ pool: "Soldier Tools", tools: ["Dice", "Playing Cards"] }]);
    expect(feats).toHaveLength(items.tools().length);
    expect(feats.find(({ name }) => name === "Tool Proficiency: Dice")?.aptitudes).toEqual([
      "Tool Proficiencies",
      "Soldier Tools",
    ]);
    expect(feats.find(({ name }) => name === "Tool Proficiency: Lute")?.aptitudes).toEqual(["Tool Proficiencies"]);
  });
});
