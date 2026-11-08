import { describe, expect, test } from "bun:test";

import { readBaseItems, readRarity } from "@/codegen/dnd5.2/tools/detect/magicItems.ts";

describe("The items a magic item is made from", () => {
  test("are those its first line names, one or several", () => {
    expect(readBaseItems("Weapon (Longsword)")).toEqual(["Longsword"]);
    expect(readBaseItems("Armor (Shield)")).toEqual(["Shield"]);
    expect(readBaseItems("Armor (Chain Mail or Chain Shirt)")).toEqual(["Chain Mail", "Chain Shirt"]);
    expect(readBaseItems("Weapon (Glaive, Greatsword, Longsword, or Scimitar)")).toEqual([
      "Glaive",
      "Greatsword",
      "Longsword",
      "Scimitar",
    ]);
  });

  test("are none for any of a kind, or another kind of item", () => {
    expect(readBaseItems("Weapon (Any Simple or Martial)")).toEqual([]);
    expect(readBaseItems("Armor (Any Medium or Heavy, Except Hide Armor)")).toEqual([]);
    expect(readBaseItems("Wondrous Item")).toEqual([]);
  });
});

describe("A magic item's rarity", () => {
  test("is the vocabulary's, a variant's bonus left out", () => {
    expect(readRarity("Very Rare")).toBe("Very Rare");
    expect(readRarity("Uncommon (+1)")).toBe("Uncommon");
    expect(readRarity("Rarity Varies")).toBe("Varies");
  });

  test("is none for a family's rarity of several", () => {
    expect(readRarity("Uncommon (+1), Rare (+2), or Very Rare (+3)")).toBeUndefined();
  });
});
