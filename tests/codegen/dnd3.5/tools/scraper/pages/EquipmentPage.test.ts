import { describe, expect, test } from "bun:test";

import { EquipmentPage } from "@/codegen/dnd3.5/tools/scraper/pages/EquipmentPage.ts";
import { fixture, named, scraped, stored } from "@/tests/support/scrapedPages.ts";

describe("A page of the SRD's equipment", () => {
  test("reads its weapons, armor and goods as their reference stores them", () => {
    const items = stored("srd/items.json", "item").raw;
    expect(scraped(new EquipmentPage(fixture("weapons")).weapons())).toEqual(
      named(items.weapons, [
        "Gauntlet",
        "Unarmed strike",
        "Dagger",
        "Dagger, punching",
        "Club",
        "Mace, heavy",
        "Longspear",
        "Quarterstaff",
        "Crossbow, heavy",
        "Bolts, crossbow (10)",
        "Axe, throwing",
        "Hammer, light",
        "Battleaxe",
        "Flail",
        "Falchion",
        "Glaive",
        "Longbow",
        "Arrows (20)",
        "Kama",
        "Nunchaku",
        "Sword, bastard",
        "Waraxe, dwarven",
        "Axe, orc double",
        "Chain, spiked",
        "Bolas",
        "Crossbow, hand",
      ]),
    );
    expect(scraped(new EquipmentPage(fixture("armor")).armor())).toEqual(
      named(items.armor, [
        "Padded",
        "Leather",
        "Hide",
        "Scale mail",
        "Splint mail",
        "Banded mail",
        "Buckler",
        "Shield, light wooden",
        "Armor spikes",
        "Gauntlet, locked",
      ]),
    );
    // The spellcasting services aren't goods
    const goods = [
      ["tableAdventuringGear", "Backpack (empty)"],
      ["tableAdventuringGear", "Barrel (empty)"],
      ["tableSpecialSubstancesAndItems", "Acid (flask)"],
      ["tableSpecialSubstancesAndItems", "Alchemist's fire (flask)"],
      ["tableToolsAndSkillKits", "Alchemist's lab"],
      ["tableToolsAndSkillKits", "Artisan's tools"],
      ["tableClothing", "Artisan's outfit"],
      ["tableClothing", "Cleric's vestments"],
      ["tableFoodDrinkAndLodging", "Gallon"],
      ["tableMountsAndRelatedGear", "Medium creature"],
      ["tableTransport", "Carriage"],
      ["tableTransport", "Cart"],
    ];
    expect(scraped(new EquipmentPage(fixture("goods")).goods())).toEqual(
      goods.map(([tableId, name]) => items.goods.find((good) => good.tableId === tableId && good.name === name)!),
    );
  });
});
