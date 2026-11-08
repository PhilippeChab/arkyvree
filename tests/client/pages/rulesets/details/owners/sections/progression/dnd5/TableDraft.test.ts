import { describe, expect, test } from "bun:test";

import { noEdits, TableDraft } from "@/client/src/pages/rulesets/details/owners/sections/progression/TableDraft.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd5/entities/classes/progression.ts";

/** Levels 1 to 3 of a class, their ids `l1`… */
const LEVELS = [1, 2, 3].map((level) => ({ id: `l${level}` }));

/** D&D 5th Edition's spell tables: spell slots, from spell level 1, and cantrips and known spells, from 0. */
const { tables: TABLES } = PROGRESSION;

/** A wizard's first three levels' spell slots as saved, by spell level: 2, 3, then 4 level 1 slots and 2 level 2. */
function draft() {
  const perDay = new Map<string, Record<string, number>>([
    ["l1", { 1: 2 }],
    ["l2", { 1: 3 }],
    ["l3", { 1: 4, 2: 2 }],
  ]);
  return new TableDraft(LEVELS, { perDay, known: new Map() }, noEdits(TABLES), TABLES);
}

describe("A D&D 5th Edition Spells tab's draft", () => {
  test("reads a spell slots column by its spell level: its first column level 1's", () => {
    const slots = draft();
    expect(LEVELS.map(({ id }) => slots.cellOf("perDay", id, 0))).toEqual([2, 3, 4]);
    expect(LEVELS.map(({ id }) => slots.cellOf("perDay", id, 1))).toEqual([null, null, 2]);
  });

  test("sends a written cell in its column, which the rules read as the column's spell level", () => {
    const edited = draft().write("perDay", [{ ownedId: "l2", column: 1, value: 1 }]);
    const body = new TableDraft(LEVELS, draft().saved, edited, TABLES).buildBody();
    expect(body.perDay).toEqual([{ ownedId: "l2", counts: [3, 1, null, null, null, null, null, null, null] }]);
  });
});
