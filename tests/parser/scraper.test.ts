import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseClassHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/class.ts";
import { parseDomainsHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/domain.ts";
import { parseFeatDetailHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/feat.ts";
import { parseArmorHtml, parseGoodsHtml, parseWeaponsHtml } from "@/database/packages/dnd35-from-parser/tools/scraper/parsers/item.ts";
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
import { readStoredReference, type ReferenceType } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/sanitize.ts";
import { REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

// The fixtures are the scraper's pages (each names its URL), trimmed to a few of their entries: each parses to the
// committed reference's entries.

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");
/** A reference as the scraper stored it, before its overrides. */
const reference = <T extends ReferenceType>(path: string, type: T) => readStoredReference(join(REFERENCE_DIR, path), type);
/** What the scraper stores of a parse. */
const stored = <T>(parsed: T) => sanitizeJsonValues(parsed);
/** The reference's entries with these names, in order: each the next with its name (a table can list one twice). */
function named<T extends { name: string }>(entries: T[], names: string[]) {
  let from = 0;
  return names.map((name) => {
    const at = entries.findIndex((entry, i) => i >= from && entry.name === name);
    from = at + 1;
    return entries[at];
  });
}

describe("The scraper reads from a page the reference's entries:", () => {
  test.each([
    ["acrobatic", "Acrobatic"],
    ["armor-proficiency-heavy", "Armor Proficiency (heavy)"],
    ["brew-potion", "Brew Potion"],
    ["cleave", "Cleave"],
  ])("the feat %s", (page, name) => {
    const feats = reference("srd/feats.json", "feat").raw;
    expect(stored(parseFeatDetailHtml(fixture(`feat-${page}`)))).toEqual(feats.find((feat) => feat.name === name)!);
  });

  test.each([
    ["acid-fog", "Acid Fog"],
    ["acid-splash", "Acid Splash"],
    ["aid", "Aid"],
    ["align-weapon", "Align Weapon"],
    ["animate-dead", "Animate Dead"],
  ])("the spell %s", (page, name) => {
    const spells = reference("srd/spells.json", "spell").raw;
    expect(stored(parseSpellDetailHtml(fixture(`spell-${page}`), ""))).toEqual(spells.find((spell) => spell.name === name)!);
  });

  test.each([
    ["dwarf", "Dwarf"],
    ["elf", "Elf"],
    ["half-elf", "Half-elf"],
    ["human", "Human"],
  ])("the race %s", (page, name) => {
    const races = reference("srd/races.json", "race").raw;
    expect(stored(parseRaceDetailHtml(fixture(`race-${page}`)))).toEqual(races.find((race) => race.name === name)!);
  });

  test.each([
    ["barbarian", "srd"],
    ["cleric", "srd"],
    ["sorcerer", "srd"],
    ["wizard", "srd"],
    ["assassin", "dmg"],
    ["urPriest", "complete-divine"],
    ["shadowmind", "complete-adventurer"],
    ["vigilante", "complete-adventurer"],
  ])("the class %s", (page, book) => {
    const klass = reference(`${book}/classes/${page}.json`, "class");
    const { _meta, ...raw } = parseClassHtml(fixture(`class-${page}`), klass._meta.sourceUrl, book);
    expect(stored(raw)).toEqual(klass.raw);
    expect({ ..._meta, scrapedAt: klass._meta.scrapedAt }).toEqual(klass._meta);
  });

  test("the domains with spells, core or not", () => {
    const domains = reference("domains.json", "domain").raw;
    const parse = (filter: "core" | "non-core" | "all") => stored(parseDomainsHtml(fixture("domains"), "", "all-domains", filter).raw);
    // Sand has no spells; Planar Domains heads the planar ones
    expect(parse("all")).toEqual(named(domains, ["Air", "Artifice", "Celestial", "Glory (BoED)", "Healing", "Strength", "War", "The Abyss"]));
    expect(parse("core")).toEqual(named(domains, ["Air", "Healing", "Strength", "War"]));
    expect(parse("non-core")).toEqual(named(domains, ["Artifice", "Celestial", "Glory (BoED)", "The Abyss"]));
  });

  test("the weapons, armor and goods", () => {
    const items = reference("srd/items.json", "item").raw;
    expect(stored(parseWeaponsHtml(fixture("weapons")))).toEqual(named(items.weapons, [
      "Gauntlet", "Unarmed strike", "Dagger", "Dagger, punching", "Club", "Mace, heavy", "Longspear", "Quarterstaff", "Crossbow, heavy", "Bolts, crossbow (10)",
      "Axe, throwing", "Hammer, light", "Battleaxe", "Flail", "Falchion", "Glaive", "Longbow", "Arrows (20)",
      "Kama", "Nunchaku", "Sword, bastard", "Waraxe, dwarven", "Axe, orc double", "Chain, spiked", "Bolas", "Crossbow, hand",
    ]));
    expect(stored(parseArmorHtml(fixture("armor"))))
      .toEqual(named(items.armor, ["Padded", "Leather", "Hide", "Scale mail", "Splint mail", "Banded mail", "Buckler", "Shield, light wooden", "Armor spikes", "Gauntlet, locked"]));
    // The spellcasting services aren't goods
    const goods = [
      ["tableAdventuringGear", "Backpack (empty)"], ["tableAdventuringGear", "Barrel (empty)"],
      ["tableSpecialSubstancesAndItems", "Acid (flask)"], ["tableSpecialSubstancesAndItems", "Alchemist's fire (flask)"],
      ["tableToolsAndSkillKits", "Alchemist's lab"], ["tableToolsAndSkillKits", "Artisan's tools"],
      ["tableClothing", "Artisan's outfit"], ["tableClothing", "Cleric's vestments"],
      ["tableFoodDrinkAndLodging", "Gallon"], ["tableMountsAndRelatedGear", "Medium creature"],
      ["tableTransport", "Carriage"], ["tableTransport", "Cart"],
    ];
    expect(stored(parseGoodsHtml(fixture("goods")))).toEqual(goods.map(([tableId, name]) => items.goods.find((good) => good.tableId === tableId && good.name === name)!));
  });

  test("the magic items, one a price of those with several", () => {
    const items = reference("srd/magicItems.json", "magicItem").raw;
    const page = (parsed: ReturnType<typeof parseRingsHtml>, category: string, names: string[]) =>
      expect(stored(parsed)).toEqual(named(items.filter((item) => item.category === category), names));
    const armor = fixture("magicArmor");
    page(parseMagicArmorHtml(armor), "specificArmor", ["Adamantine Breastplate", "Banded Mail of Luck"]);
    page(parseMagicShieldsHtml(armor), "specificShield", ["Absorbing Shield", "Caster's Shield"]);
    page(parseMagicWeaponsHtml(fixture("magicWeapons")), "specificWeapon",
      ["Adamantine Battleaxe", "Luck Blade, 0 Wishes", "Luck Blade, 1 Wish", "Luck Blade, 2 Wishes", "Luck Blade, 3 Wishes", "Slaying Arrow", "Greater Slaying Arrow"]);
    page(parseWondrousItemsHtml(fixture("wondrousItems")), "wondrousItem", ["Amulet of Health +2", "Amulet of Health +4", "Amulet of Health +6", "Bag of Holding"]);
    page(parseRingsHtml(fixture("rings")), "ring", [
      "Animal Friendship", "Energy Resistance, Minor", "Energy Resistance, Major", "Energy Resistance, Greater",
      "Protection +1", "Protection +2", "Protection +3", "Protection +4", "Protection +5",
    ]);
    page(parseRodsHtml(fixture("rods")), "rod", ["Absorption", "Metamagic Rods, Lesser", "Metamagic Rods, Normal", "Metamagic Rods, Greater"]);
    page(parseStaffsHtml(fixture("staffs")), "staff", ["Abjuration", "Charming"]);
  });
});
