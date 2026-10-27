import { describe, expect, test } from "bun:test";

import { FieldWrites } from "@/engine/core/fields/index.ts";

/** Each field a talent always writes, holding its default: a flag's own, false without one. */
const DEFAULTS = { TRAINED: [true], SECRET: [false], RANK: ["Novice"], COST: [1] };

/**
 * Two owner types' fields: a talent's, each kind always written, a flag with a default and one without, a text and a
 * number with theirs, and a free text; a badge's, none always written.
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
    }
    // A false flag and a default number it writes, always written, as they are
    expect(WRITES.written("talents", { TRAINED: false, COST: 1 }, false)).toEqual({ TRAINED: [false], COST: [1] });
  });

  test("writes no default of an owner type none of whose fields is always written", () => {
    expect(WRITES.written("badges", {}, true)).toEqual({});
    expect(WRITES.written("badges", { SHINY: false }, true)).toEqual({ SHINY: [] });
  });
});
