import { describe, expect, test } from "bun:test";

import { readComponents, readSpellSave } from "@/codegen/dnd5.2/tools/detect/spells.ts";

describe("A spell's components", () => {
  test("are named for the letters the database writes", () => {
    expect(readComponents(["V", "S", "M"])).toEqual(["Verbal", "Somatic", "Material"]);
  });

  test("throw for a letter of none", () => {
    expect(() => readComponents(["X"])).toThrow('"X" names no spell component');
  });
});

describe("The saving throw a spell calls for", () => {
  test("is the first its text names", () => {
    expect(readSpellSave("Each creature makes a Dexterity saving throw, then a Constitution saving throw.")).toBe(
      "Dexterity",
    );
  });

  test("is none for a spell that calls for none", () => {
    expect(readSpellSave("Make a ranged spell attack against the target.")).toBeUndefined();
  });
});
