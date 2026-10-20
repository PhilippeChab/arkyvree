import { describe, expect, test } from "bun:test";

import {
  parseSpellCell,
  parseSpellRows,
  placeSpellRows,
  readPastedColumn,
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
    // Past the rules' bound for a table's count
    expect(parseSpellCell("120", false)).toBeUndefined();
  });

  test("reads a row's level when it says one, or when the rows count up from it", () => {
    expect(parseSpellRows("1st\t3\t1\n2nd\t4\t2", false)).toEqual([
      { cells: [3, 1], level: 1 },
      { cells: [4, 2], level: 2 },
    ]);
    expect(parseSpellRows("4: 6, 3, -", false)).toEqual([{ cells: [6, 3, null], level: 4 }]);
    // Three rows counting up from 1: a book's table, its level column first
    expect(parseSpellRows("1 3 1\n2 4 2\n3 4 2 1", false).map((row) => row.level)).toEqual([1, 2, 3]);
    // Two rows of counts alone, and three counting up from past 1: counts too
    expect(parseSpellRows("3 1\n4 2", false)).toEqual([{ cells: [3, 1] }, { cells: [4, 2] }]);
    expect(parseSpellRows("2 1\n3 2\n4 3", false).map((row) => row.level)).toEqual([undefined, undefined, undefined]);
    // Unless they count up from the level the paste starts at
    expect(parseSpellRows("11 4\n12 4\n13 5", false, 11).map((row) => row.level)).toEqual([11, 12, 13]);
  });

  test("leaves out a table's header rows", () => {
    const rows = parseSpellRows("Level\tCantrips\t1st\n1\t3\t1\n2\t4\t2\n3\t4\t2", false);
    expect(rows.map((row) => row.level)).toEqual([1, 2, 3]);
    expect(rows[0].cells).toEqual([3, 1]);
    // A header naming its spell levels after a 0 is one too, and with no level column its rows are counts
    expect(parseSpellRows("0 1st 2nd\n3 1\n4 2", false)).toEqual([{ cells: [3, 1] }, { cells: [4, 2] }]);
    // A row with a cell it can't read is a row still (a cleric's "1+1")
    expect(parseSpellRows("1st\t3\t1+1\n2nd\t4\t2+1", false)).toEqual([
      { cells: [3, undefined], level: 1 },
      { cells: [4, undefined], level: 2 },
    ]);
    // A spreadsheet's title row over its header, its first cell empty
    const titled = parseSpellRows("\tSpells per Day\t\t\nLevel\t0\t1\t2\n1\t3\t1\t\n2\t4\t2\t\n3\t4\t2\t1", false);
    expect(titled.map((row) => row.level)).toEqual([1, 2, 3]);
    // Over a level column: a header of bare numbers under an empty corner, and spacer rows
    expect(parseSpellRows("\t0\t1\t2\n1\t3\t1\n2\t4\t2\n3\t4\t2\t1", false).map((row) => row.level)).toEqual([1, 2, 3]);
    expect(parseSpellRows("1\t3\t1\n2\t4\t2\n\t\t\n3\t4\t2\t1", false).map((row) => row.level)).toEqual([1, 2, 3]);
    // A header of the spell levels' numbers alone, over counts alone
    expect(parseSpellRows("0\t1\t2\n3\t1\n4\t2", false)).toEqual([{ cells: [3, 1] }, { cells: [4, 2] }]);
    // A header numbering its spell levels is one too
    expect(parseSpellRows("Level 0 1 2\n1 3 1\n2 4 2\n3 4 2 1", false).map((row) => row.level)).toEqual([1, 2, 3]);
  });

  test("reads the spell level a header names its first count column", () => {
    // A paladin's, from 1st; a table from its cantrips; one with no header
    expect(readPastedColumn("Level\t1st\t2nd\n4th\t0\t—\n6th\t1\t—", false)).toBe(1);
    expect(readPastedColumn("Level\tCantrips\t1st\n1\t3\t1\n2\t4\t2\n3\t4\t2", false)).toBe(0);
    expect(readPastedColumn("0 1st 2nd\n3 1\n4 2", false)).toBe(0);
    expect(readPastedColumn("1st 3 1\n2nd 4 2", false)).toBeUndefined();
  });

  test("keeps a spreadsheet's empty cells where they are", () => {
    expect(parseSpellRows("4\t\t2\n\t3\n\t\n", false)).toEqual([
      { cells: [4, null, 2] },
      { cells: [null, 3] },
      { cells: [null, null] },
    ]);
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
    // A level the class lacks: the rows after it go on from the next one it has
    const gap = placeSpellRows(parseSpellRows("1st 1\n3rd 3\n9", false), [LEVELS[0], LEVELS[3]], 0, 0, 10);
    expect(gap).toEqual([
      { levelId: "l1", spellLevel: 0, value: 1 },
      { levelId: "l4", spellLevel: 0, value: 9 },
    ]);
  });
});
