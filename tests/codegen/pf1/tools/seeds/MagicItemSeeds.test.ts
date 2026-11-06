import { describe, expect, test } from "bun:test";

import { BookSeeds } from "@/codegen/pf1/tools/seeds/BookSeeds.ts";
import type { MagicItemSeeds } from "@/codegen/pf1/tools/seeds/MagicItemSeeds.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { Engine } from "@/engine/index.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/pf1/equipment.ts";
import {
  ITEM_COST_GP,
  ITEM_MADE_OF,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
} from "@/vocabulary/pf1/fields/index.ts";
import { ITEM_TYPES } from "@/vocabulary/pf1/itemTemplates.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

/** Every magic item seed of the Core Rulebook. */
function allSeeds() {
  return Object.values(magicItems().seeds()).flat();
}

/** The Core Rulebook's magic item seeds. */
function magicItems(): MagicItemSeeds {
  const book = new BookSeeds(CORE_BOOK);
  const ref = book.reference("magicItem");
  if (!ref) throw new Error("The Core Rulebook has no magic item reference");
  return book.magicItems(ref);
}

/** The magic item seed `name`. */
function seedNamed(name: string) {
  return allSeeds().find((seed) => seed.name === name);
}

describe("A magic item reference's items", () => {
  test("are a seed per variant its book lists, its bonus after its name, each priced as its stat block prices it", () => {
    const cloaks = allSeeds().filter(({ name }) => name.startsWith("Cloak of Resistance"));
    expect(cloaks.map(({ name, fields }) => [name, fields[ITEM_COST_GP]])).toEqual([
      ["Cloak of Resistance +1", 1000],
      ["Cloak of Resistance +2", 4000],
      ["Cloak of Resistance +3", 9000],
      ["Cloak of Resistance +4", 16000],
      ["Cloak of Resistance +5", 25000],
    ]);
    expect(seedNamed("Cloak of Resistance +2")).toMatchObject({
      fields: { [ITEM_TYPE]: "Wondrous Item", [ITEM_SLOT]: "Shoulders", [MAGIC_AURA]: ["Faint abjuration"] },
      modifiers: [bonus("saves.*.misc", 2)],
    });
    expect(seedNamed("Rod of Metamagic, Empower (lesser)")?.fields[ITEM_COST_GP]).toBe(9000);
  });

  test("make a specific weapon or armor of its base item, with its enhancement and what it's made of", () => {
    expect(seedNamed("Holy Avenger")).toMatchObject({
      links: { madeFrom: "Longsword" },
      fields: { [ITEM_TYPE]: "Weapon", [ITEM_MADE_OF]: "Cold Iron", [MAGIC_CASTER_LEVEL]: 18 },
      modifiers: [bonus("weapon.tohit.magic", 2), bonus("weapon.damage.magic", 2)],
    });
    expect(seedNamed("Banded Mail of Luck")).toMatchObject({
      links: { madeFrom: "Banded Mail" },
      fields: { [ITEM_TYPE]: "Armor", [ITEM_SLOT]: "Armor", [ITEM_WEIGHT]: 35 },
      modifiers: [bonus("combat.ac.armor", 3)],
    });
    expect(seedNamed("Lion's Shield")).toMatchObject({
      links: { madeFrom: "Heavy Steel Shield" },
      fields: { [ITEM_TYPE]: "Shield", [ITEM_SLOT]: "Off Hand" },
    });
  });

  test("are made from items the book's item reference seeds", () => {
    const book = new BookSeeds(CORE_BOOK);
    const bases = new Set(Object.keys(book.items(book.reference("item")!).weights()));
    const madeFrom = allSeeds().flatMap(({ links }) => (links?.madeFrom ? [links.madeFrom] : []));
    expect(madeFrom.length).toBeGreaterThan(40);
    expect(madeFrom.filter((name) => !bases.has(name))).toEqual([]);
  });

  test("leave out the artifacts, the cursed items and the special abilities, which are no item of their own", () => {
    const leftOut = magicItems().leftOut();
    expect(leftOut).toContain("armor: Fortification");
    expect(leftOut).toContain("weapon: Flaming");
    expect(seedNamed("Flaming")).toBeUndefined();
    expect(leftOut.filter((entry) => /^(?:artifact|cursed): /.test(entry)).length).toBe(12 + 29);
  });

  test("have names no two of them share, an item type and a slot the rules have, and modifiers the engine targets", () => {
    const seeds = allSeeds();
    const names = seeds.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(seeds.filter(({ fields }) => !(ITEM_TYPES as readonly unknown[]).includes(fields[ITEM_TYPE]))).toEqual([]);
    expect(seeds.filter(({ fields }) => !(LOCATION_OPTIONS as readonly unknown[]).includes(fields[ITEM_SLOT]))).toEqual(
      [],
    );
    const bookNames = { abilities: ABILITY_NAMES, saves: [...SAVE_NAMES], skills: [...SKILL_NAMES] };
    const paths = new Set(
      Engine.forRules(PF1_BASE_RULES)
        .listBookTargetPaths(bookNames, "modifier")
        .map((tp) => tp.path),
    );
    const modifiers: Modifier[] = seeds.flatMap((seed) => seed.modifiers ?? []);
    const targets = modifiers.map(({ target }) => target);
    expect(targets.filter((target) => !paths.has(target))).toEqual([]);
  });
});
