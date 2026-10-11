import { describe, expect, test } from "bun:test";

import Dnd35PicksDistribution from "@/engine/rulesets/dnd3.5/levelUp/Dnd35PicksDistribution.ts";

/**
 * Two levels of a character past its tenth, its rank caps out of reach: the first a class's with Climb and Hide, the
 * second a class's with Climb alone, 4 points each.
 */
const LEVELS = {
  perLevelClassSkillIds: [["climb", "hide"], ["climb"]],
  perLevelSkillPoints: [4, 4],
  savedLevelCount: 10,
};

const SKILLS = [
  { id: "climb", currentRank: 0, isClassSkill: true },
  { id: "hide", currentRank: 0, isClassSkill: true },
];

/** The distribution of `levels`' skill points, no pool slots. */
function distributionOf(levels: typeof LEVELS) {
  return new Dnd35PicksDistribution({
    ...levels,
    perLevelFeatSlots: {},
    perLevelPowerSlots: {},
    skillContexts: Dnd35PicksDistribution.contextsOf(SKILLS),
  });
}

describe("spreading a save's skill points over its planned levels", () => {
  test("spreads them in the form's order, class-skill levels first", () => {
    const distribution = distributionOf(LEVELS);
    // Climb spends the first level's points: Hide is left the second's, cross-class there
    const levels = distribution.distribute(
      { skills: { climb: 4, hide: 4 }, feats: {}, powers: {} },
      new Map(),
      new Map(),
    );
    expect(levels.map(({ skills }) => skills)).toEqual([{ climb: 4 }, { hide: 4 }]);
    expect(distribution.spendSkillPoints({ climb: 4, hide: 4 }).get("hide")).toEqual({ points: 4, ranks: 2 });
    // Hide first takes the first level's, a rank a point, and Climb the second's
    const hideFirst = distribution.spendSkillPoints({ hide: 4, climb: 4 });
    expect([hideFirst.get("hide")!.ranks, hideFirst.get("climb")!.ranks]).toEqual([4, 4]);
  });

  test("caps a skill's points at its rank cap at each level, moving what's over to the next", () => {
    // A new character's first two levels, 8 points each: Climb caps at 4 ranks at the first, 5 at the second
    const distribution = distributionOf({
      perLevelClassSkillIds: [["climb"], ["climb"]],
      perLevelSkillPoints: [8, 8],
      savedLevelCount: 0,
    });
    const levels = distribution.distribute({ skills: { climb: 8 }, feats: {}, powers: {} }, new Map(), new Map());
    expect(levels.map(({ skills }) => skills)).toEqual([{ climb: 4 }, { climb: 1 }]);
    expect(distribution.spendSkillPoints({ climb: 8 }).get("climb")).toEqual({ points: 5, ranks: 5 });
  });
});
