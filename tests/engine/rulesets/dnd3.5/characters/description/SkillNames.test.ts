import { describe, expect, test } from "bun:test";

import SkillNames from "@/engine/rulesets/dnd3.5/characters/description/SkillNames.ts";

describe("a skill's name as a sheet groups it", () => {
  test("names its family by the words before its brackets, and itself by what they hold", () => {
    expect(SkillNames.describe("Knowledge (arcana)")).toEqual({ family: "Knowledge", shortName: "arcana" });
    expect(SkillNames.describe("Craft (alchemy) - Masterwork")).toEqual({
      family: "Craft",
      shortName: "(alchemy) - Masterwork",
    });
    expect(SkillNames.describe("Knowledge (lore (elves))")).toEqual({
      family: "Knowledge",
      shortName: "(lore (elves))",
    });
  });

  test("gives a skill without brackets no family, and its whole name", () => {
    expect(SkillNames.describe("Balance")).toEqual({ family: null, shortName: "Balance" });
  });
});
