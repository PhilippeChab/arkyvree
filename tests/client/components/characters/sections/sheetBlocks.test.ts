import { describe, expect, test } from "bun:test";

import { entityPagePath, type SheetBlock, withBase } from "@/client/src/components/characters/sections/sheetBlocks.ts";

/** A sheet's blocks: two abilities with their bases, saves without, and a combat line. */
const BLOCKS: SheetBlock[] = [
  {
    kind: "scores",
    key: "abilities",
    title: "Ability Scores",
    empty: "No ability scores",
    scores: [
      {
        key: "str",
        label: "Strength",
        short: "STR",
        value: 16,
        badge: 3,
        base: { label: "Base", value: 14, min: 1, max: 100 },
        parts: [],
      },
      {
        key: "dex",
        label: "Dexterity",
        short: "DEX",
        value: 12,
        badge: 1,
        base: { label: "Base", value: 12, min: 1, max: 100 },
        parts: [],
      },
    ],
  },
  {
    kind: "scores",
    key: "saves",
    title: "Saving Throws",
    empty: "No saving throws",
    scores: [{ key: "str", label: "Fortitude", short: "Fortitude", value: 2, signed: true, parts: [] }],
  },
  { kind: "stats", key: "combat", title: "Combat", empty: "No weapons equipped", stats: [], panels: [] },
];

describe("A sheet's blocks", () => {
  test("links an entry to its page in its ruleset, where its kind has one", () => {
    expect(entityPagePath("r1", "feats", "f1")).toBe("/rulesets/r1/feats/f1/customization");
    expect(entityPagePath("r1", "powers", "p1")).toBe("/rulesets/r1/powers/p1/customization");
    // No ruleset to read it in, no id, or a kind without a page of its own
    expect(entityPagePath(undefined, "feats", "f1")).toBeUndefined();
    expect(entityPagePath("r1", "feats", null)).toBeUndefined();
    expect(entityPagePath("r1", "klasses", "k1")).toBeUndefined();
    expect(entityPagePath("r1", "nonsense", "x")).toBeUndefined();
  });

  test("moves a score's value by its base's change, its badge kept, until the server answers", () => {
    const [abilities] = withBase(BLOCKS, "abilities", "str", 18);
    expect(abilities.kind === "scores" && abilities.scores[0]).toMatchObject({
      value: 20,
      badge: 3,
      base: { value: 18, min: 1, max: 100 },
    });
  });

  test("keeps every other score and block as it is, and a score with no base of its own", () => {
    const [abilities, saves, combat] = withBase(BLOCKS, "abilities", "str", 18);
    expect(abilities.kind === "scores" && abilities.scores[1]).toBe(BLOCKS[0].kind === "scores" && BLOCKS[0].scores[1]);
    expect(saves).toBe(BLOCKS[1]);
    expect(combat).toBe(BLOCKS[2]);
    // The saves' score shares the ability's key, but has no base
    expect(withBase(BLOCKS, "saves", "str", 18)[1]).toEqual(BLOCKS[1]);
  });
});
