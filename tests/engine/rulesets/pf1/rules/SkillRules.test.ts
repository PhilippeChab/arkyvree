import { describe, expect, test } from "bun:test";

import SkillRules from "@/engine/rulesets/pf1/rules/SkillRules.ts";

// A rank a point, class skill or not: each level's points are spent in order, the rest unspent.
describe("skill points spent", () => {
  test.each([
    ["at one level, a rank a point", 4, [4], { ranks: 4, perLevel: [4] }],
    ["over levels, first levels first", 5, [3, 4], { ranks: 5, perLevel: [3, 2] }],
    ["within each level's points, the rest unspent", 10, [2, 3], { ranks: 5, perLevel: [2, 3] }],
  ])("go %s", (_, spent, points, expected) => {
    expect(SkillRules.spend(spent, points)).toEqual(expected);
  });
});

describe("a skill's rank cap", () => {
  test("is the character's hit dice, class skill or not", () => {
    expect([SkillRules.maxRank(1), SkillRules.maxRank(4), SkillRules.maxRank(20)]).toEqual([1, 4, 20]);
  });
});

describe("a class skill's bonus", () => {
  test("is +3 once it has a rank, and none on a skill that isn't a class skill", () => {
    expect([
      SkillRules.classSkillBonus(0, true),
      SkillRules.classSkillBonus(1, true),
      SkillRules.classSkillBonus(5, false),
    ]).toEqual([0, 3, 0]);
  });
});

describe("a level's skill points", () => {
  test("are its class's and Intelligence's, none below 0, with a bonus beside, at a first level as at any other", () => {
    expect([
      SkillRules.levelPoints(3, 0),
      SkillRules.levelPoints(3, 1),
      SkillRules.levelPoints(-1, 0),
      SkillRules.levelPoints(-1, 1),
    ]).toEqual([3, 4, 0, 1]);
  });
});

describe("a class's class skills", () => {
  test("are its links' subtypes by any of their names: a translated Craft keeps a Craft (Alchemy) of its own", () => {
    const skills = [
      { id: "craft", names: ["Artisanat", "Craft"] },
      { id: "alchemy", names: ["Craft (Alchemy)"] },
      { id: "bows", names: ["Artisanat (Arcs)", "Craft (Bows)"] },
      { id: "crafty", names: ["Craftsmanship"] },
    ];
    expect([...SkillRules.classSkillIds(["craft"], skills)]).toEqual(["craft", "alchemy", "bows"]);
    expect(SkillRules.classSkillIds([], skills).size).toBe(0);
  });
});
