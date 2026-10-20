import { describe, expect, test } from "bun:test";

import {
  NO_SPELL_EDITS,
  SpellDraft,
  type SpellEdits,
} from "@/client/src/pages/rulesets/details/classes/sections/dnd3.5/SpellDraft.ts";

/** Levels 1 to 4 of a class, their ids `l1`… */
const LEVELS = [1, 2, 3, 4].map((level) => ({ id: `l${level}` }));

/** A sorcerer-like class's tables as saved: 3 cantrips a day at every level, 2 known from level 1, 3 from level 3. */
function draft(edits: SpellEdits = NO_SPELL_EDITS) {
  const perDay = new Map(LEVELS.map(({ id }) => [id, { 0: 3 }]));
  const known = new Map(LEVELS.map(({ id }, index) => [id, { 0: index < 2 ? 2 : 3 }]));
  return new SpellDraft(LEVELS, { perDay, known }, edits);
}

describe("A Spells tab's draft", () => {
  test("shows its edits over the saved cells, an emptied one as none, and counts what differs", () => {
    const edited = draft().write("perDay", [
      { levelId: "l2", spellLevel: 0, value: 4 },
      { levelId: "l3", spellLevel: 0, value: null },
    ]);
    const spells = draft(edited);
    expect(LEVELS.map(({ id }) => spells.cellOf("perDay", id, 0))).toEqual([3, 4, null, 3]);
    expect(spells.countChanged("perDay")).toBe(2);
  });

  test("knows every spell at each level after one that knows them all, and keeps no edit under it", () => {
    const edited = draft().write("known", [
      { levelId: "l2", spellLevel: 0, value: "all" },
      { levelId: "l4", spellLevel: 0, value: 9 },
    ]);
    const spells = draft(edited);
    expect(LEVELS.map(({ id }) => spells.cellOf("known", id, 0))).toEqual([2, "all", "all", "all"]);
    expect(edited.known.l4).toEqual({});
    expect(LEVELS.map(({ id }) => spells.isKnownAbove("known", id, 0))).toEqual([false, false, true, true]);
    // A write under the All changes nothing that shows
    expect(spells.changesOf("known", [{ levelId: "l3", spellLevel: 0, value: 5 }])).toEqual([]);
  });

  test("takes a count over a column's first All down the levels saved All by it, up to an All of their own", () => {
    // Saved: 2 known at level 1, All from level 2, and at level 4 an All of its own after a count at 3
    const known = new Map<string, Record<string, number | "All">>([
      ["l1", { 0: 2 }],
      ["l2", { 0: "All" }],
      ["l3", { 0: 3 }],
      ["l4", { 0: "All" }],
    ]);
    const saved = new SpellDraft(LEVELS, { perDay: new Map(), known }, NO_SPELL_EDITS);
    const counted = new SpellDraft(
      LEVELS,
      saved.saved,
      saved.write("known", [{ levelId: "l2", spellLevel: 0, value: 4 }]),
    );
    expect(LEVELS.map(({ id }) => counted.cellOf("known", id, 0))).toEqual([2, 4, 3, "all"]);

    // An All typed over saved counts, then a count over it: the counts below come back
    const allFromTwo = draft().write("known", [{ levelId: "l2", spellLevel: 0, value: "all" }]);
    const undone = draft(allFromTwo).write("known", [{ levelId: "l2", spellLevel: 0, value: 4 }]);
    expect(LEVELS.map(({ id }) => draft(undone).cellOf("known", id, 0))).toEqual([2, 4, 3, 3]);
  });

  test("sends each changed level's row, with its every spell level, per day's All as none", () => {
    const edited = draft().write("perDay", [{ levelId: "l2", spellLevel: 1, value: "all" }]);
    const known = draft(edited).write("known", [{ levelId: "l1", spellLevel: 0, value: 1 }]);
    const body = draft(known).buildBody();
    expect(body.perDay).toEqual([{ levelId: "l2", counts: [3, null, null, null, null, null, null, null, null, null] }]);
    expect(body.known).toEqual([{ levelId: "l1", counts: [1, null, null, null, null, null, null, null, null, null] }]);
  });
});
