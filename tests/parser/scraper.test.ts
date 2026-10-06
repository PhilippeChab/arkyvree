/**
 * The fixtures are the scraper's pages (each names its URL), trimmed to a few of their entries: each parses to the
 * committed reference's entries.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { readStoredReference, type ReferenceType } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class/classPage.ts";
import {
  domainBookCode,
  domainName,
  parseDomainIndexHtml,
  parseDomainPageHtml,
  parseSpellDomainLevelsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/domain.ts";
import { parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import {
  parseArmorHtml,
  parseGoodsHtml,
  parseWeaponsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/item.ts";
import {
  parseMagicArmorHtml,
  parseMagicShieldsHtml,
  parseMagicWeaponsHtml,
  parseRingsHtml,
  parseRodsHtml,
  parseStaffsHtml,
  parseWondrousItemsHtml,
} from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/magicItem.ts";
import { parseRaceDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/race.ts";
import { parseSpellDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/spell.ts";

function fixture(name: string) {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");
}

/** The reference's entries with these names, in order: each the next with its name (a table can list one twice). */
function named<T extends { name: string }>(entries: T[], names: string[]) {
  let from = 0;
  return names.map((name) => {
    const at = entries.findIndex((entry, i) => i >= from && entry.name === name);
    from = at + 1;
    return entries[at];
  });
}

/** What the scraper stores of a parse. */
function scraped<T>(parsed: T) {
  return sanitizeJsonValues(parsed);
}

/** A reference as the scraper stored it, before its overrides. */
function stored<T extends ReferenceType>(file: string, type: T) {
  return readStoredReference(join(REFERENCE_DIR, file), type);
}

/** The URL a fixture's page was fetched from, which its second line names. */
function urlOf(name: string) {
  const url = fixture(name).match(/^<!-- (\S+), trimmed/m)?.[1];
  if (!url) throw new Error(`${name} doesn't name its URL`);
  return url;
}

describe("The scraper reads from a page the reference's entries:", () => {
  test.each([
    ["acrobatic", "srd", "Acrobatic"],
    ["armor-proficiency-heavy", "srd", "Armor Proficiency (heavy)"],
    ["brew-potion", "srd", "Brew Potion"],
    // In two categories: Fighter Bonus Feat and General
    ["cleave", "srd", "Cleave"],
    // Epic, though also Divine
    ["zone-of-animation", "complete-divine", "Zone of Animation"],
    // A skill trick, though first a movement one
    ["walk-the-walls", "complete-scoundrel", "Walk the Walls"],
  ])("the feat %s", (page, book, name) => {
    const feats = stored(`${book}/feats.json`, "feat").raw;
    expect(scraped(parseFeatDetailHtml(fixture(`feat-${page}`)))).toEqual(feats.find((feat) => feat.name === name)!);
  });

  test.each([
    ["acid-fog", "Acid Fog"],
    ["acid-splash", "Acid Splash"],
    ["aid", "Aid"],
    ["align-weapon", "Align Weapon"],
    ["animate-dead", "Animate Dead"],
    // Its slug is its URL's, bears-endurance, not its name's
    ["bears-endurance", "Bear's Endurance"],
  ])("the spell %s", (page, name) => {
    const spells = stored("srd/spells.json", "spell").raw;
    expect(scraped(parseSpellDetailHtml(fixture(`spell-${page}`), urlOf(`spell-${page}`)))).toEqual(
      spells.find((spell) => spell.name === name)!,
    );
  });

  test.each([
    ["dwarf", "Dwarf"],
    ["elf", "Elf"],
    ["half-elf", "Half-elf"],
    ["human", "Human"],
  ])("the race %s", (page, name) => {
    const races = stored("srd/races.json", "race").raw;
    expect(scraped(parseRaceDetailHtml(fixture(`race-${page}`)))).toEqual(races.find((race) => race.name === name)!);
  });

  test.each([
    ["barbarian", "srd"],
    ["cleric", "srd"],
    ["sorcerer", "srd"],
    ["wizard", "srd"],
    // Its table's other columns, each named by the header over it too: "AC" over "Bonus"
    ["monk", "srd"],
    ["assassin", "dmg"],
    ["urPriest", "complete-divine"],
    ["shadowmind", "complete-adventurer"],
    ["vigilante", "complete-adventurer"],
  ])("the class %s", (page, book) => {
    const klass = stored(`${book}/classes/${page}.json`, "class");
    const { _meta, ...raw } = parseClassHtml(fixture(`class-${page}`), urlOf(`class-${page}`), book);
    expect(scraped(raw)).toEqual(klass.raw);
    expect({ ..._meta, scrapedAt: klass._meta.scrapedAt }).toEqual(klass._meta);
  });

  test("the domains: the index's versions, a version's book, page, granted power and spells, a spell's level in each", () => {
    expect(parseDomainIndexHtml(fixture("domain-index"))).toEqual({
      entries: [
        { slug: "air", label: "Air" },
        { slug: "celerity-cd", label: "Celerity (CD)" },
        { slug: "celerity", label: "Celerity (SpC)" },
      ],
      total: 299,
    });

    const weather = named(stored("complete-divine/domains.json", "domain").raw, ["Weather"])[0];
    expect(parseDomainPageHtml(fixture("domain-weather"))).toEqual({
      label: "Weather (CD)",
      bookSlug: "complete-divine--56",
      page: weather.page,
      description: weather.description,
      spells: [
        { path: "complete-divine--56/binding-winds--692", name: "Binding Winds", edition: "Supplementals (3.5)" },
        { path: "players-handbook-v35--6/call-lightning--2592", name: "Call Lightning", edition: "Core (3.5)" },
      ],
    });
    // A version whose page names no book, nor its granted power: its label's code places it
    expect(parseDomainPageHtml(fixture("domain-glory-cd"))).toEqual({
      label: "Glory (CD)",
      description: "",
      spells: [
        { path: "complete-divine--56/crown-of-glory--697", name: "Crown of Glory", edition: "Supplementals (3.5)" },
      ],
    });
    expect([domainName("Glory (CD)"), domainBookCode("Glory (CD)"), domainBookCode("Air")]).toEqual([
      "Glory",
      "CD",
      undefined,
    ]);

    // The domain versions only, not the classes
    expect(parseSpellDomainLevelsHtml(fixture("domain-spell-levels"))).toEqual(
      new Map([
        ["treachery", 1],
        ["liberation-cd", 1],
      ]),
    );
  });

  test("the weapons, armor and goods", () => {
    const items = stored("srd/items.json", "item").raw;
    expect(scraped(parseWeaponsHtml(fixture("weapons")))).toEqual(
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
    expect(scraped(parseArmorHtml(fixture("armor")))).toEqual(
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
    expect(scraped(parseGoodsHtml(fixture("goods")))).toEqual(
      goods.map(([tableId, name]) => items.goods.find((good) => good.tableId === tableId && good.name === name)!),
    );
  });

  test("the magic items, one a price of those with several", () => {
    const items = stored("srd/magicItems.json", "magicItem").raw;
    const page = (parsed: ReturnType<typeof parseRingsHtml>, category: string, names: string[]) =>
      expect(scraped(parsed)).toEqual(
        named(
          items.filter((item) => item.category === category),
          names,
        ),
      );
    const armor = fixture("magicArmor");
    page(parseMagicArmorHtml(armor), "specificArmor", ["Adamantine Breastplate", "Banded Mail of Luck"]);
    page(parseMagicShieldsHtml(armor), "specificShield", ["Absorbing Shield", "Caster's Shield"]);
    page(parseMagicWeaponsHtml(fixture("magicWeapons")), "specificWeapon", [
      "Adamantine Battleaxe",
      "Luck Blade, 0 Wishes",
      "Luck Blade, 1 Wish",
      "Luck Blade, 2 Wishes",
      "Luck Blade, 3 Wishes",
      "Slaying Arrow",
      "Greater Slaying Arrow",
    ]);
    page(parseWondrousItemsHtml(fixture("wondrousItems")), "wondrousItem", [
      "Amulet of Health +2",
      "Amulet of Health +4",
      "Amulet of Health +6",
      "Bag of Holding",
    ]);
    page(parseRingsHtml(fixture("rings")), "ring", [
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
    page(parseRodsHtml(fixture("rods")), "rod", [
      "Absorption",
      "Metamagic Rods, Lesser",
      "Metamagic Rods, Normal",
      "Metamagic Rods, Greater",
    ]);
    page(parseStaffsHtml(fixture("staffs")), "staff", ["Abjuration", "Charming"]);
  });
});
