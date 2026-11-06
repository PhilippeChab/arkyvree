import { describe, expect, test } from "bun:test";

import References from "@/codegen/pf1/tools/references/References.ts";
import { SpellSeeds } from "@/codegen/pf1/tools/seeds/SpellSeeds.ts";
import type { LeveledSpellSeed } from "@/content/pf1/builders/spells/types.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";
import { ENTITY_FIELDS, SPELL_SAVE_EFFECT } from "@/vocabulary/pf1/fields/index.ts";
import { SAVE_NAMES } from "@/vocabulary/pf1/saves.ts";

/** The Core Rulebook's spells' seeds. */
function coreSeeds(): SpellSeeds {
  return new SpellSeeds(References.load(References.path(CORE_BOOK, "spell"), "spell"));
}

/** A spell's level on each of its lists. */
function levelsOf(spell: LeveledSpellSeed) {
  return spell.aptitudes.map((list) => spell.aptitudeLevels?.[list] ?? spell.level);
}

describe("The Core Rulebook's spells", () => {
  test("are each its spell, at its lowest level on its classes' lists, sorted by level then name", () => {
    const spells = coreSeeds().seeds();
    expect(spells).toHaveLength(623);
    for (const spell of spells) {
      expect(spell.aptitudes.length).toBeGreaterThan(0);
      expect(spell.level).toBe(Math.min(...levelsOf(spell)));
    }
    expect(spells.map(({ level }) => level)).toEqual(spells.map(({ level }) => level).toSorted((a, b) => a - b));
    expect(spells.find(({ name }) => name === "Animate Dead")).toMatchObject({
      level: 3,
      aptitudes: ["Adept Spells", "Cleric Spells", "Sorcerer Spells", "Wizard Spells"],
      aptitudeLevels: { "Adept Spells": 3, "Cleric Spells": 3, "Sorcerer Spells": 4, "Wizard Spells": 4 },
    });
    expect(spells.find(({ name }) => name === "Fireball")).not.toHaveProperty("aptitudeLevels");
  });

  test("give each field that declares its values one of them, a save the vocabulary's, and leave nothing unread", () => {
    const seeds = coreSeeds();
    const { components, descriptors, school, subschool } = ENTITY_FIELDS.spells;
    for (const spell of seeds.seeds()) {
      expect(school.values as readonly string[]).toContain(spell.fields[school.field] ?? "");
      for (const { field, values } of [components, descriptors, subschool])
        for (const value of spell.fields[field] ?? []) expect(values as readonly string[]).toContain(value);
      if (spell.links?.resistedBy) expect(SAVE_NAMES).toContain(spell.links.resistedBy);
    }
    for (let level = 0; level <= 9; level++) expect(seeds.reviewNotes(level)).toEqual([]);
  });

  test("leave out what the Core Rulebook has none of: later books' classes and descriptors", () => {
    const { classes, descriptors } = coreSeeds().leftOut();
    expect(classes).toContain("magus");
    expect(classes).not.toContain("wizard");
    expect(descriptors).toContain("emotion");
  });
});

describe("A spell's saving throw", () => {
  test("is what a successful save does and the save it is, by its name, when its text opens on one", () => {
    const read = SpellSeeds.readSavingThrow;
    expect(read("Reflex half")).toEqual({ fields: { [SPELL_SAVE_EFFECT]: "half" }, links: { resistedBy: "Reflex" } });
    expect(read("Will negates (harmless)")).toEqual({
      fields: { [SPELL_SAVE_EFFECT]: "negates (harmless)" },
      links: { resistedBy: "Will" },
    });
    // Two saves are the first's, the rest what it does
    expect(read("Fortitude negates, Will partial, see text")).toEqual({
      fields: { [SPELL_SAVE_EFFECT]: "negates, Will partial, see text" },
      links: { resistedBy: "Fortitude" },
    });
  });

  test("is all effect when its text opens on no save, and nothing when it's none", () => {
    const read = SpellSeeds.readSavingThrow;
    expect(read("none")).toEqual({ fields: {} });
    expect(read("no")).toEqual({ fields: {} });
    expect(read("")).toEqual({ fields: {} });
    expect(read("see text")).toEqual({ fields: { [SPELL_SAVE_EFFECT]: "see text" } });
    expect(read("none or Will negates; see text")).toEqual({
      fields: { [SPELL_SAVE_EFFECT]: "none or Will negates; see text" },
    });
  });
});

describe("A spell's override", () => {
  test("corrects its stat block's texts by label and its description", () => {
    const ref = References.load(References.path(CORE_BOOK, "spell"), "spell");
    const seeds = new SpellSeeds({
      ...ref,
      overrides: { "Acid Arrow": { description: "Corrected.", fields: { Range: "close (25 ft. + 5 ft./2 levels)" } } },
    });
    expect(seeds.seeds().find(({ name }) => name === "Acid Arrow")).toMatchObject({
      description: "Corrected. Material Component: Rhubarb leaf and an adder's stomach. Focus: A dart.",
      fields: { SPELL_RANGE_TYPE: "Close" },
    });
  });
});
