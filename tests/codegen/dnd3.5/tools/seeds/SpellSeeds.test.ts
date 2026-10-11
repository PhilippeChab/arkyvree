import { describe, expect, test } from "bun:test";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import Library from "@/codegen/dnd3.5/tools/seeds/Library.ts";
import type { SpellSeed } from "@/content/dnd3.5/builders/spells/types.ts";
import { CORE_BOOK } from "@/vocabulary/dnd3.5/books.ts";

/** A spell's level on each of its lists. */
function levelsOf(spell: SpellSeed) {
  return spell.aptitudes.map((list) => ({ list, level: spell.aptitudeLevels?.[list] ?? spell.level }));
}

/** A book's spell seeds. */
function spellsOf(book: string): SpellSeed[] {
  const ref = References.find(book, "spell");
  if (!ref) throw new Error(`${book} has no spells`);
  return Library.book(book).spells(ref).seeds();
}

describe("A spell's level", () => {
  test("is a core spell's lowest on the core rules' lists, not an extension's list the core lacks", () => {
    const coreLists = Library.book(CORE_BOOK).spellLists();
    const fireShield = spellsOf(CORE_BOOK).find(({ name }) => name === "Fire Shield");
    expect(fireShield).toMatchObject({
      level: 4,
      aptitudeLevels: { "Sorcerer Spells": 4, "Warmage Spells": 3, "Wizard Spells": 4 },
    });
    for (const spell of spellsOf(CORE_BOOK)) {
      const onCoreLists = levelsOf(spell).filter(({ list }) => coreLists.has(list));
      if (onCoreLists.length > 0) expect(spell.level).toBe(Math.min(...onCoreLists.map(({ level }) => level)));
    }
  });

  test("is an extension's spell's lowest on any of its lists, which its ruleset has", () => {
    for (const book of References.books().filter((book) => book !== CORE_BOOK && References.find(book, "spell"))) {
      for (const spell of spellsOf(book)) {
        const levels = levelsOf(spell);
        if (levels.length > 0) expect(spell.level).toBe(Math.min(...levels.map(({ level }) => level)));
      }
    }
  });
});

describe("A spell's lists", () => {
  test("hold those its override's level entries add, at their level, as the copies of a core spell do", () => {
    const classLists = Library.book(CORE_BOOK).classSpellLists();
    let added = 0;
    for (const book of References.books()) {
      const ref = References.find(book, "spell");
      for (const spell of ref ? spellsOf(book) : []) {
        for (const { className, level } of ref?.overrides?.[spell.name]?.levelEntries ?? []) {
          expect(levelsOf(spell)).toContainEqual({ list: classLists[className], level });
          added++;
        }
      }
    }
    expect(added).toBeGreaterThan(0);
    // The Assassin's list is no list of the core rules: its 2nd level leaves Illusory Script a 3rd-level spell there
    expect(spellsOf(CORE_BOOK).find(({ name }) => name === "Illusory Script")).toMatchObject({
      level: 3,
      aptitudeLevels: { "Assassin Spells": 2, "Bard Spells": 3, "Wizard Spells": 3 },
    });
  });
});
