import { describe, expect, test } from "bun:test";

import { placeTable } from "@/client/src/pages/rulesets/details/owners/sections/progression/tablePaste.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd5.2/entities/classes/progression.ts";

/** Levels 1 to 3 of a class, their ids `l1`… */
const LEVELS = [1, 2, 3].map((position) => ({ id: `l${position}`, position }));

/** D&D 5th Edition's Spell Slots table, its columns from spell level 1. */
const [SLOTS] = PROGRESSION.tables;

/** The columns (by index) a pasted table's cells land on, with their values, by level. */
function columns(text: string) {
  const cells = Object.groupBy(placeTable(text, SLOTS, LEVELS, 0, 0), (cell) => cell.ownedId);
  return Object.fromEntries(
    Object.entries(cells).map(([id, landed]) => [
      id,
      landed!.map(({ column, value }) => `${column}:${value}`).join(" "),
    ]),
  );
}

describe("A pasted D&D 5th Edition spell slots table", () => {
  test("reads a header of bare numbers from 1 as its columns' spell levels, not as a level's slots", () => {
    // A wizard's first levels, as its SRD table prints them: its first column is level 1's slots
    expect(columns("1 2 3 4 5 6 7 8 9\n1 2 —\n2 3 —\n3 4 2")).toEqual({
      l1: "0:2 1:null",
      l2: "0:3 1:null",
      l3: "0:4 1:2",
    });
    // As the SRD heads it, and from a spreadsheet's empty corner cell
    expect(columns("Level 1 2 3\n1 2 —\n2 3 —\n3 4 2")).toEqual({ l1: "0:2 1:null", l2: "0:3 1:null", l3: "0:4 1:2" });
    expect(columns("\t1\t2\n1\t2\t—\n2\t3\t—\n3\t4\t2")).toEqual({ l1: "0:2 1:null", l2: "0:3 1:null", l3: "0:4 1:2" });
  });
});
