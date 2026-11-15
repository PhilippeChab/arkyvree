import { describe, expect, test } from "bun:test";

import LevelRules from "@/engine/rulesets/pf1/rules/LevelRules.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/pf1/ruleset/fields.ts";
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

  test("end at the 20th level, unless a ruleset's Settings go past it", async () => {
    const rules = await seededLevelRules();
    expect([rules.lastLevel, rules.countLevelsLeft(0), rules.countLevelsLeft(19), rules.countLevelsLeft(20)]).toEqual([
      20, 20, 1, 0,
    ]);
    const beyond = new LevelRules({ ...RULESET_FIELDS.defaults, lastLevel: 25 });
    expect([beyond.countLevelsLeft(20), beyond.countLevelsLeft(25), beyond.countLevelsLeft(30)]).toEqual([5, 0, 0]);
    // The core rules' general feats go on at the odd levels past 20th, and their ability increases every 4th
    expect([21, 22, 23].map((level) => beyond.countGeneralFeatsAfter(level - 1))).toEqual([1, 0, 1]);
    expect(beyond.isAbilityIncreaseLevel(23)).toBe(true);
  });
});
