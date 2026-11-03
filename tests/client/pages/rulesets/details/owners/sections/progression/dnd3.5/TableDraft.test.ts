import { describe, expect, test } from "bun:test";

import {
  noEdits,
  type PlannedTables,
  TableDraft,
  type TableEdits,
} from "@/client/src/pages/rulesets/details/owners/sections/progression/TableDraft.ts";
import { PROGRESSION } from "@/engine/rulesets/dnd3.5/entities/classes/progression.ts";

/** Levels 1 to 4 of a class, their ids `l1`… */
const LEVELS = [1, 2, 3, 4].map((level) => ({ id: `l${level}` }));

/** 3.5's spell tables: spells per day, and spells known, which take All. */
const { tables: TABLES } = PROGRESSION;

/** Its rules' answer for a draft's save (`edits`'): spells known at each level, a spell level a column. */
function answerFor(edits: TableEdits, known: Record<string, number | "All">[]): PlannedTables {
  const perDay = new Map(LEVELS.map(({ id }) => [id, { 0: 3 }]));
  return {
    body: draft(edits).buildBody(),
    totals: { perDay, known: new Map(LEVELS.map(({ id }, index) => [id, known[index]])) },
  };
}

/**
 * A sorcerer-like class's tables as saved: 3 cantrips a day at every level, 2 known from level 1, 3 from level 3; with
 * its edits (`edits`), and its rules' answer for a save (`planned`).
 */
function draft(edits: TableEdits = noEdits(TABLES), planned?: PlannedTables) {
  const perDay = new Map(LEVELS.map(({ id }) => [id, { 0: 3 }]));
  const known = new Map(LEVELS.map(({ id }, index) => [id, { 0: index < 2 ? 2 : 3 }]));
  return new TableDraft(LEVELS, { perDay, known }, edits, TABLES, planned);
}

describe("A Spells tab's draft", () => {
  test("shows its edits as typed until its rules answer them, and counts what differs", () => {
    const edited = draft().write("perDay", [
      { ownedId: "l2", column: 0, value: 4 },
      { ownedId: "l3", column: 0, value: null },
    ]);
    const spells = draft(edited);
    expect(LEVELS.map(({ id }) => spells.cellOf("perDay", id, 0))).toEqual([3, 4, null, 3]);
    expect(spells.countChanged("perDay")).toBe(2);
  });

  test("shows its rules' answer for its save once they gave it", () => {
    // 2 1st-level spells known from level 2: its rules read the levels after it as 0, and their own columns as saved
    const opened = draft().write("known", [{ ownedId: "l2", column: 1, value: 2 }]);
    const answer = answerFor(opened, [{ 0: 2 }, { 0: 2, 1: 2 }, { 0: 3, 1: 0 }, { 0: 3, 1: 0 }]);
    const spells = draft(opened, answer);
    expect(spells.answered).toBe(true);
    expect(LEVELS.map(({ id }) => spells.cellOf("known", id, 1))).toEqual([null, 2, 0, 0]);
    expect(LEVELS.map(({ id }) => spells.cellOf("known", id, 0))).toEqual([2, 2, 3, 3]);
    expect(spells.countChanged("known")).toBe(3);
    expect(spells.countChanged("perDay")).toBe(0);
    // A draft that saves nothing shows its tables as saved
    expect(LEVELS.map(({ id }) => draft(noEdits(TABLES), answer).cellOf("known", id, 1))).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  test("shows a draft its rules haven't answered yet as edited, never another draft's answer", () => {
    // Answered: 2 1st-level spells known from level 2, its rules reading 0 at levels 3 and 4
    const first = draft().write("known", [{ ownedId: "l2", column: 1, value: 2 }]);
    const answer = answerFor(first, [{ 0: 2 }, { 0: 2, 1: 2 }, { 0: 3, 1: 0 }, { 0: 3, 1: 0 }]);
    // Then, while its answer is on its way, level 2's count cleared and level 1's cantrips changed
    const pending = draft(
      draft(first, answer).write("known", [
        { ownedId: "l1", column: 0, value: 5 },
        { ownedId: "l2", column: 1, value: null },
      ]),
      answer,
    );
    expect(pending.answered).toBe(false);
    expect(LEVELS.map(({ id }) => pending.cellOf("known", id, 1))).toEqual([null, null, null, null]);
    expect(LEVELS.map(({ id }) => pending.cellOf("known", id, 0))).toEqual([5, 2, 3, 3]);
    expect(pending.countChanged("known")).toBe(1);
    // A 0 written at level 3 meanwhile is a change: no answer the earlier draft got swallows it
    expect(pending.changesOf("known", [{ ownedId: "l3", column: 1, value: 0 }])).toEqual([
      { ownedId: "l3", column: 1, value: 0 },
    ]);
  });

  test("takes no edit under a level that knows every spell, and keeps none there", () => {
    const edited = draft().write("known", [
      { ownedId: "l2", column: 0, value: "all" },
      { ownedId: "l4", column: 0, value: 9 },
    ]);
    expect(edited.known.l4).toEqual({});
    const spells = draft(edited, answerFor(edited, [{ 0: 2 }, { 0: "All" }, { 0: "All" }, { 0: "All" }]));
    expect(LEVELS.map(({ id }) => spells.cellOf("known", id, 0))).toEqual([2, "all", "all", "all"]);
    expect(LEVELS.map(({ id }) => spells.isAllAbove("known", id, 0))).toEqual([false, false, true, true]);
    // A write under the All changes nothing that shows
    expect(spells.changesOf("known", [{ ownedId: "l3", column: 0, value: 5 }])).toEqual([]);
  });

  test("takes no edit under an All its rules haven't answered yet, at any level after it, and says so", () => {
    // All typed at level 2, then, before its rules answer it, 7 at level 4
    const all = draft(draft().write("known", [{ ownedId: "l2", column: 0, value: "all" }]));
    expect(LEVELS.map(({ id }) => all.isAllAbove("known", id, 0))).toEqual([false, false, true, true]);
    const written = all.write("known", [{ ownedId: "l4", column: 0, value: 7 }]);
    expect(written.known.l4).toEqual({});
    // What a paste's or a typed cell's writer tells: under an All, it shows other than what was written
    const next = all.withEdits(written);
    expect(next.isAllAbove("known", "l4", 0) && next.cellOf("known", "l4", 0) !== 7).toBe(true);
  });

  test("takes a count over a column's first All down the levels saved All by it, up to an All of their own", () => {
    // Saved: 2 known at level 1, All from level 2, and at level 4 an All of its own after a count at 3
    const known = new Map<string, Record<string, number | "All">>([
      ["l1", { 0: 2 }],
      ["l2", { 0: "All" }],
      ["l3", { 0: 3 }],
      ["l4", { 0: "All" }],
    ]);
    const saved = new TableDraft(LEVELS, { perDay: new Map(), known }, noEdits(TABLES), TABLES);
    const counted = new TableDraft(
      LEVELS,
      saved.saved,
      saved.write("known", [{ ownedId: "l2", column: 0, value: 4 }]),
      TABLES,
    );
    expect(LEVELS.map(({ id }) => counted.cellOf("known", id, 0))).toEqual([2, 4, 3, "all"]);

    // A block of counts over it: each level below takes the count written nearest above it
    const allFromOne = new Map(LEVELS.map(({ id }) => [id, { 0: "All" as const }]));
    const all = new TableDraft(LEVELS, { perDay: new Map(), known: allFromOne }, noEdits(TABLES), TABLES);
    const block = all.write("known", [
      { ownedId: "l1", column: 0, value: 2 },
      { ownedId: "l2", column: 0, value: 3 },
    ]);
    expect(LEVELS.map(({ id }) => new TableDraft(LEVELS, all.saved, block, TABLES).cellOf("known", id, 0))).toEqual([
      2, 3, 3, 3,
    ]);

    // An All typed over saved counts, then a count over it: the counts below come back
    const allFromTwo = draft().write("known", [{ ownedId: "l2", column: 0, value: "all" }]);
    const undone = draft(allFromTwo).write("known", [{ ownedId: "l2", column: 0, value: 4 }]);
    expect(LEVELS.map(({ id }) => draft(undone).cellOf("known", id, 0))).toEqual([2, 4, 3, 3]);
  });

  test("sends each level's row it edits, with its every spell level as edited, per day's All as none", () => {
    const edited = draft().write("perDay", [{ ownedId: "l2", column: 1, value: "all" }]);
    const known = draft(edited).write("known", [
      { ownedId: "l1", column: 0, value: 1 },
      { ownedId: "l2", column: 1, value: 2 },
    ]);
    const body = draft(known).buildBody();
    expect(body.perDay).toEqual([{ ownedId: "l2", counts: [3, null, null, null, null, null, null, null, null, null] }]);
    // The levels after a count its rules read as 0, none of them sent
    expect(body.known).toEqual([
      { ownedId: "l1", counts: [1, null, null, null, null, null, null, null, null, null] },
      { ownedId: "l2", counts: [2, 2, null, null, null, null, null, null, null, null] },
    ]);
  });
});
