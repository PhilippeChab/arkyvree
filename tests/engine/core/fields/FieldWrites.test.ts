import { describe, expect, test } from "bun:test";

import { FieldWrites } from "@/engine/core/fields/index.ts";

/** Each field a talent always writes, holding its default: a flag's own, false without one. */
const DEFAULTS = { TRAINED: [true], SECRET: [false], RANK: ["Novice"], COST: [1] };

/**
 * A gadget's fields: a title that keeps those its form shows among its others (a motto, a group's level, the flag and
 * the count), its weight beside its name, and a count that counts only while the flag is on.
 */
const RULED = new FieldWrites({
  gadgets: {
    title: { description: "Its title", field: "TITLE", keepsForm: true, kind: "text", label: "Title", merge: "winner" },
    weight: {
      description: "Its weight",
      field: "WEIGHT",
      kind: "number",
      label: "Weight",
      merge: "winner",
      placement: "beside-name",
    },
    motto: { description: "Its motto", field: "MOTTO", kind: "text", label: "Motto", merge: "winner" },
    on: { description: "Whether it's on", field: "ON", kind: "flag", label: "On", merge: "winner" },
    count: {
      default: 1,
      description: "How many",
      field: "COUNT",
      kind: "number",
      label: "Count",
      merge: "winner",
      min: 1,
      when: { field: "on", values: [true] },
    },
    group: {
      fields: { level: { description: "Its level", field: "LEVEL", kind: "number", label: "Level", merge: "winner" } },
      kind: "group",
      label: "Group",
    },
  },
});

/**
 * Two owner types' fields: a talent's, each kind always written, a flag with a default and one without, a text and a
 * number with theirs, a free text, and a choice, which no declaration writes always; a badge's, none always written.
 */
const WRITES = new FieldWrites({
  talents: {
    trained: {
      default: true,
      description: "Whether it needs training",
      field: "TRAINED",
      kind: "flag",
      label: "Trained",
      merge: "winner",
      write: "always",
    },
    secret: {
      description: "Whether it's kept secret",
      field: "SECRET",
      kind: "flag",
      label: "Secret",
      merge: "winner",
      write: "always",
    },
    rank: {
      default: "Novice",
      description: "Its rank",
      field: "RANK",
      kind: "text",
      label: "Rank",
      merge: "winner",
      values: ["Novice", "Adept"],
      write: "always",
    },
    cost: {
      default: 1,
      description: "What it costs",
      field: "COST",
      kind: "number",
      label: "Cost",
      merge: "winner",
      write: "always",
    },
    motto: { description: "Its motto", field: "MOTTO", kind: "text", label: "Motto", merge: "winner" },
    school: {
      description: "Its school",
      field: "SCHOOL",
      kind: "choice",
      label: "School",
      merge: "winner",
      values: ["Abjuration", "Evocation"],
    },
  },
  badges: {
    shiny: { description: "Whether it shines", field: "SHINY", kind: "flag", label: "Shiny", merge: "winner" },
  },
});

describe("A write of an owner's fields", () => {
  test("gives a new owner each field always written it leaves out its default, and an existing one none", () => {
    expect(WRITES.written("talents", { MOTTO: "Onward" }, true)).toEqual({ MOTTO: ["Onward"], ...DEFAULTS });
    expect(WRITES.written("talents", { MOTTO: "Onward" }, false)).toEqual({ MOTTO: ["Onward"] });
    expect(WRITES.written("talents", { RANK: "Adept", SECRET: true }, true)).toEqual({
      ...DEFAULTS,
      RANK: ["Adept"],
      SECRET: [true],
    });
  });

  test("gives a field always written that it clears its default, new owner or not, and clears any other", () => {
    for (const creating of [true, false]) {
      expect(WRITES.written("talents", { RANK: null, COST: [], TRAINED: null, MOTTO: "" }, creating)).toMatchObject({
        RANK: ["Novice"],
        COST: [1],
        TRAINED: [true],
        MOTTO: [],
      });
      expect(WRITES.written("talents", { RANK: "" }, creating).RANK).toEqual(["Novice"]);
      // A choice is never always written (`ChoiceSpec` declares no `write`): an empty one clears it, as a text's would
      expect(WRITES.written("talents", { SCHOOL: "" }, creating)).toMatchObject({ SCHOOL: [] });
      expect(WRITES.written("talents", { SCHOOL: "Evocation" }, creating)).toMatchObject({ SCHOOL: ["Evocation"] });
    }
    // A false flag and a default number it writes, always written, as they are
    expect(WRITES.written("talents", { TRAINED: false, COST: 1 }, false)).toEqual({ TRAINED: [false], COST: [1] });
  });

  test("writes no default of an owner type none of whose fields is always written", () => {
    expect(WRITES.written("badges", {}, true)).toEqual({});
    expect(WRITES.written("badges", { SHINY: false }, true)).toEqual({ SHINY: [] });
  });
});

describe("A write of an owner's fields on their rules", () => {
  test("stores a field whose condition doesn't hold at its default, and one the write doesn't name as it is", () => {
    for (const creating of [true, false]) {
      expect(RULED.written("gadgets", { TITLE: "A", ON: false, COUNT: 3 }, creating)).toEqual({
        TITLE: ["A"],
        ON: [],
        COUNT: [],
      });
      expect(RULED.written("gadgets", { TITLE: "A", ON: true, COUNT: 3 }, creating).COUNT).toEqual([3]);
    }
    // A new owner's flag the write doesn't name is off; an existing one's, unknown, leaves its count as given
    expect(RULED.written("gadgets", { TITLE: "A", COUNT: 3 }, true).COUNT).toEqual([]);
    expect(RULED.written("gadgets", { TITLE: "A", COUNT: 3 }, false).COUNT).toEqual([3]);
  });

  test("stores none of the fields its form shows among its others without a value of the one that keeps them", () => {
    const given = { MOTTO: "Onward", LEVEL: 2, WEIGHT: 5, ON: true, COUNT: 3 };
    const kept = { MOTTO: ["Onward"], LEVEL: [2], WEIGHT: [5], ON: [true], COUNT: [3] };
    // Its weight, beside its name, it keeps all the same
    const cleared = { MOTTO: [], LEVEL: [], WEIGHT: [5], ON: [], COUNT: [] };
    for (const creating of [true, false]) {
      expect(RULED.written("gadgets", { ...given, TITLE: "" }, creating)).toEqual({ ...cleared, TITLE: [] });
      expect(RULED.written("gadgets", { ...given, TITLE: "A" }, creating)).toEqual({ ...kept, TITLE: ["A"] });
    }
    // A new owner holds no title the write doesn't name; an existing one keeps its own, and the fields it keeps
    expect(RULED.written("gadgets", given, true)).toEqual(cleared);
    expect(RULED.written("gadgets", given, false)).toEqual(kept);
  });
});
