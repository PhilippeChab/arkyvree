import { describe, expect, test } from "bun:test";

import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

const CLIMB = "climb";
/** A ruleset's skills, in its order: two with a subtype, one nested. */
const SKILLS = [
  { id: "craft", names: ["Craft"] },
  { id: "armorsmithing", names: ["Craft (Armorsmithing)"] },
  { id: "ancient", names: ["Knowledge (Arcana) (Ancient)"] },
  { id: "arcana", names: ["Knowledge (Arcana)"] },
  { id: "climb", names: ["Climb"] },
];

/** Levels by whether Climb is a class skill at them, with the skill points each gives. */
function levels(...entries: [classSkill: boolean, points: number][]) {
  return {
    classSkills: entries.map(([classSkill]) => (classSkill ? [CLIMB] : [])),
    points: entries.map(([, points]) => points),
  };
}

// A class skill takes a point a rank, a cross-class one two: class-skill levels are spent first.
describe("skill points spent", () => {
  test.each([
    ["at a class-skill level, a rank a point", levels([true, 4]), 4, { ranks: 4, perLevel: [4] }],
    ["at a cross-class level, half a rank a point", levels([false, 8]), 4, { ranks: 2, perLevel: [4] }],
    [
      "at class-skill levels first, then cross-class ones",
      levels([false, 8], [true, 3]),
      7,
      { ranks: 5, perLevel: [4, 3] },
    ],
    [
      "within each level's points, the rest unspent",
      levels([true, 2], [false, 3]),
      10,
      { ranks: 3.5, perLevel: [2, 3] },
    ],
  ])("go %s", (_, { classSkills, points }, spent, expected) => {
    expect(SkillRules.spend(CLIMB, spent, classSkills, points)).toEqual(expected);
  });
});

describe("a skill's rank cap", () => {
  test("is the character's level + 3 for a class skill, half that for a cross-class one", () => {
    expect([SkillRules.maxRank(1, true), SkillRules.maxRank(1, false), SkillRules.maxRank(4, false)]).toEqual([
      4, 2, 3.5,
    ]);
  });
});

describe("a level's skill points", () => {
  test("are at least 1 with a bonus beside, then four times over at the character's first level", () => {
    expect([
      SkillRules.levelPoints(3, 0, false),
      SkillRules.levelPoints(3, 0, true),
      SkillRules.levelPoints(-1, 0, false),
      SkillRules.levelPoints(-1, 0, true),
    ]).toEqual([3, 12, 1, 4]);
    // A human's 1 a level comes beside the minimum: 4 more at the first level, not multiplied in with a penalty.
    expect([SkillRules.levelPoints(-2, 1, false), SkillRules.levelPoints(-2, 1, true)]).toEqual([2, 8]);
  });
});

describe("a class's class skills", () => {
  test("are the skills its links name and their subtypes, nested ones too, and no skill the ruleset doesn't have", () => {
    expect([...SkillRules.classSkillIds(["craft", "arcana", "gone"], SKILLS)].sort()).toEqual(
      ["ancient", "arcana", "armorsmithing", "craft"].sort(),
    );
    expect(SkillRules.classSkillIds([], SKILLS).size).toBe(0);
  });

  test("are its links' subtypes by any of their names: a translated Craft keeps a Craft (Alchemy) of its own", () => {
    const translated = [
      { id: "craft", names: ["Artisanat", "Craft"] },
      { id: "alchemy", names: ["Craft (Alchemy)"] },
      { id: "armorsmithing", names: ["Artisanat (Armurerie)", "Craft (Armorsmithing)"] },
      { id: "spotlight", names: ["Craftsmanship"] },
    ];
    expect([...SkillRules.classSkillIds(["craft"], translated)]).toEqual(["craft", "alchemy", "armorsmithing"]);
  });

  test("come in the ruleset's order, whatever the links' order", () => {
    expect([...SkillRules.classSkillIds(["climb", "arcana", "craft"], SKILLS)]).toEqual([
      "craft",
      "armorsmithing",
      "ancient",
      "arcana",
      "climb",
    ]);
  });
});
