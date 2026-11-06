import { describe, expect, test } from "bun:test";

import LevelRules from "@/engine/rulesets/pf1/rules/LevelRules.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { getPf1SeedCtx } from "@/tests/support/pf1/seed.ts";

/** The character levels from 1 to 20. */
const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

/** The seeded Pathfinder core rules' level rules, off its Settings. */
async function seededLevelRules() {
  const { rulesetId } = await getPf1SeedCtx();
  return await withRulesetScope(db, rulesetId, async (scope) => LevelRules.of(scope));
}

describe("The Pathfinder core rules' levels", () => {
  test("give a general feat at every odd level, the 1st among them: 10 by the 20th", async () => {
    const rules = await seededLevelRules();
    // A level's feats, after the levels before it
    expect(LEVELS.map((level) => rules.countGeneralFeatsAfter(level - 1))).toEqual(LEVELS.map((level) => level % 2));
    expect(LEVELS.map((level) => rules.countGeneralFeats(level))).toEqual(LEVELS.map((level) => Math.ceil(level / 2)));
  });

  test("give an ability increase at every 4th level: the 4th, 8th, 12th, 16th and 20th", async () => {
    const rules = await seededLevelRules();
    expect(LEVELS.filter((level) => rules.isAbilityIncreaseLevel(level - 1))).toEqual([4, 8, 12, 16, 20]);
  });

  test("end at the 20th level", () => {
    expect([LevelRules.countLevelsLeft(0), LevelRules.countLevelsLeft(19), LevelRules.countLevelsLeft(20)]).toEqual([
      20, 1, 0,
    ]);
  });
});
