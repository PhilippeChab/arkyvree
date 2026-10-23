import { describe, expect, test } from "bun:test";

import { blockOf, type SheetBlock, withBase } from "@/client/src/components/characters/sections/sheetBlocks.ts";

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
  test("finds a block by its kind and key", () => {
    expect(blockOf(BLOCKS, "scores", "saves")?.title).toBe("Saving Throws");
    expect(blockOf(BLOCKS, "stats", "combat")?.title).toBe("Combat");
    expect(blockOf(BLOCKS, "stats", "saves")).toBeUndefined();
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
