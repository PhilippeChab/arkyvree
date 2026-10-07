import { describe, expect, test } from "bun:test";

import { MagicItemPage } from "@/database/packages/dnd35-from-parser/tools/scraper/pages/MagicItemPage.ts";
import { fixture, named, scraped, stored } from "@/tests/support/scrapedPages.ts";

describe("A page of the SRD's magic items", () => {
  test("reads its items as their reference stores them, one a price of those with several", () => {
    const items = stored("srd/magicItems.json", "magicItem").raw;
    const page = (parsed: ReturnType<MagicItemPage["items"]>, category: string, names: string[]) =>
      expect(scraped(parsed)).toEqual(
        named(
          items.filter((item) => item.category === category),
          names,
        ),
      );
    const armor = fixture("magicArmor");
    page(new MagicItemPage(armor).items("Specific Armors", "specificArmor"), "specificArmor", [
      "Adamantine Breastplate",
      "Banded Mail of Luck",
    ]);
    page(new MagicItemPage(armor).items("Specific Shields", "specificShield"), "specificShield", [
      "Absorbing Shield",
      "Caster's Shield",
    ]);
    page(new MagicItemPage(fixture("magicWeapons")).items("Specific Weapons", "specificWeapon"), "specificWeapon", [
      "Adamantine Battleaxe",
      "Luck Blade, 0 Wishes",
      "Luck Blade, 1 Wish",
      "Luck Blade, 2 Wishes",
      "Luck Blade, 3 Wishes",
      "Slaying Arrow",
      "Greater Slaying Arrow",
    ]);
    page(new MagicItemPage(fixture("wondrousItems")).wondrousItems(), "wondrousItem", [
      "Amulet of Health +2",
      "Amulet of Health +4",
      "Amulet of Health +6",
      "Bag of Holding",
    ]);
    page(new MagicItemPage(fixture("rings")).items("Ring Descriptions", "ring"), "ring", [
      "Animal Friendship",
      "Energy Resistance, Minor",
      "Energy Resistance, Major",
      "Energy Resistance, Greater",
      "Protection +1",
      "Protection +2",
      "Protection +3",
      "Protection +4",
      "Protection +5",
    ]);
    page(new MagicItemPage(fixture("rods")).items("Rod Descriptions", "rod"), "rod", [
      "Absorption",
      "Metamagic Rods, Lesser",
      "Metamagic Rods, Normal",
      "Metamagic Rods, Greater",
    ]);
    page(new MagicItemPage(fixture("staffs")).items("Staff Descriptions", "staff"), "staff", [
      "Abjuration",
      "Charming",
    ]);
  });
});
