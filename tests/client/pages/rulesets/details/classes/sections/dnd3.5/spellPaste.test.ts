import { describe, expect, test } from "bun:test";

import {
  parseSpellCell,
  parseSpellRows,
  placeSpellRows,
} from "@/client/src/pages/rulesets/details/classes/sections/dnd3.5/spellPaste.ts";

/** Levels 1 to 5 of a class, their ids `l1`… */
const LEVELS = [1, 2, 3, 4, 5].map((level) => ({ id: `l${level}`, level }));

describe("A pasted spell table", () => {
  test("reads a cell as a count, none or every spell, and leaves anything else unread", () => {
    expect(["3", "", " — ", "-", "all", "*", "x"].map((cell) => parseSpellCell(cell, true))).toEqual([
      3,
      null,
      null,
      null,
      "all",
      "all",
      undefined,
    ]);
    expect(parseSpellCell("all", false)).toBeUndefined();
  });

  test("reads a row's level when it says one, or when the rows count up from it", () => {
    expect(parseSpellRows("1st\t3\t1\n2nd\t4\t2", false)).toEqual([
      { cells: [3, 1], level: 1 },
      { cells: [4, 2], level: 2 },
    ]);
    expect(parseSpellRows("4: 6, 3, -", false)).toEqual([{ cells: [6, 3, null], level: 4 }]);
    // Three rows counting up from 1: a book's table, its level column first
    expect(parseSpellRows("1 3 1\n2 4 2\n3 4 2 1", false).map((row) => row.level)).toEqual([1, 2, 3]);
    // Two rows of counts alone
    expect(parseSpellRows("3 1\n4 2", false)).toEqual([{ cells: [3, 1] }, { cells: [4, 2] }]);
  });

  test("lands its rows on the levels they name, or one a level from where it's pasted", () => {
    const named = placeSpellRows(parseSpellRows("2nd 4 2\n4th 5", false), LEVELS, 0, 0, 10);
    expect(named).toEqual([
      { levelId: "l2", spellLevel: 0, value: 4 },
      { levelId: "l2", spellLevel: 1, value: 2 },
      { levelId: "l4", spellLevel: 0, value: 5 },
    ]);
    // From the third level's last column: past the class's last level and its last column left out, an unread cell too
    const plain = placeSpellRows(parseSpellRows("1 2\nx\n7\n9", false), LEVELS, 2, 9, 10);
    expect(plain).toEqual([
      { levelId: "l3", spellLevel: 9, value: 1 },
      { levelId: "l5", spellLevel: 9, value: 7 },
    ]);
  });
});
