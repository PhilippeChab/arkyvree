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
