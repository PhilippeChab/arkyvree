import { describe, expect, test } from "bun:test";

import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

/** The core rules' level rules: those of a ruleset whose chain holds no progression of its own. */
const CORE = new LevelRules(RULESET_FIELDS.defaults);

describe("LevelRules", () => {
  test("give the core rules' feats without a ruleset's own: one at the first level, then one every third", () => {
    expect([0, 1, 2, 3, 5, 6, 18, 20].map((level) => CORE.countGeneralFeats(level))).toEqual([0, 1, 1, 2, 2, 3, 7, 7]);
  });

  test("give the core rules' ability increases without a ruleset's own: one every fourth level", () => {
    const levels = Array.from({ length: 20 }, (_, i) => i).filter((before) => CORE.isAbilityIncreaseLevel(before));
    // The levels before each increase's: it's the next one's
    expect(levels).toEqual([3, 7, 11, 15, 19]);
    expect([CORE.countAbilityIncreases(3), CORE.countAbilityIncreases(4), CORE.countAbilityIncreases(20)]).toEqual([
      1, 0, 0,
    ]);
  });

  test("give a ruleset's own: its feats at each level, several at one, and its increases where it has them", () => {
    const featsPerLevel = RULESET_FIELDS.defaults.featsPerLevel.map((count, i) =>
      i === 2 || i === 4 ? count + 1 : count,
    );
    const abilityIncreasesPerLevel = Array<number>(20).fill(0).with(1, 1);
    const rules = new LevelRules({ abilityIncreasesPerLevel, featsPerLevel });
    expect([1, 2, 3, 4, 5, 6].map((level) => rules.countGeneralFeats(level))).toEqual([1, 1, 3, 3, 4, 5]);
    expect([0, 1, 2, 3].map((before) => rules.isAbilityIncreaseLevel(before))).toEqual([false, true, false, false]);
  });
});
