import { describe, expect, test } from "bun:test";

import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";

/** The core rules' level rules: those of a ruleset whose chain holds no progression of its own. */
const CORE = new LevelRules(RULESET_FIELDS.defaults);

describe("LevelRules", () => {
  test("give the core rules' feats without a ruleset's own: one at the first level, then one every third", () => {
    expect([0, 1, 2, 3, 5, 6, 18, 20].map((level) => CORE.countGeneralFeats(level))).toEqual([0, 1, 1, 2, 2, 3, 7, 7]);
    // Its frequency runs past 20th, into the epic levels: a feat at 21st and 24th
    expect(CORE.countGeneralFeats(24)).toBe(9);
    expect([0, 1, 2, 5].map((before) => CORE.countGeneralFeatsAfter(before))).toEqual([1, 0, 1, 1]);
  });

  test("give the core rules' ability increases without a ruleset's own: one every fourth level", () => {
    const levels = Array.from({ length: 24 }, (_, i) => i).filter((before) => CORE.isAbilityIncreaseLevel(before));
    // The levels before each increase's: it's the next one's
    expect(levels).toEqual([3, 7, 11, 15, 19, 23]);
    expect([CORE.countAbilityIncreases(3), CORE.countAbilityIncreases(4)]).toEqual([1, 0]);
  });

  test("give a ruleset's own: its frequency, and more at the levels it names", () => {
    const rules = new LevelRules({
      // An increase every 5 levels, and one at the second
      abilityIncreases: { every: 5, extra: [{ amount: 1, position: 2 }] },
      // The core rules' feats, and one more at levels 3 and 5
      featAdvancement: {
        every: 3,
        extra: [
          { amount: 1, position: 1 },
          { amount: 1, position: 3 },
          { amount: 1, position: 5 },
        ],
      },
      lastLevel: 20,
    });
    expect([1, 2, 3, 4, 5, 6].map((level) => rules.countGeneralFeats(level))).toEqual([1, 1, 3, 3, 4, 5]);
    expect([0, 1, 2, 3, 4].map((before) => rules.isAbilityIncreaseLevel(before))).toEqual([
      false,
      true,
      false,
      false,
      true,
    ]);
    // None at all: no frequency, nothing more
    const none = new LevelRules({
      abilityIncreases: { every: 0, extra: [] },
      featAdvancement: { every: 0, extra: [] },
      lastLevel: 20,
    });
    expect([none.countGeneralFeats(20), none.countAbilityIncreases(3)]).toEqual([0, 0]);
  });

  test("stop a character at its Settings' last level, 20th in the core rules", () => {
    expect([CORE.lastLevel, CORE.countLevelsLeft(0), CORE.countLevelsLeft(18), CORE.countLevelsLeft(20)]).toEqual([
      20, 20, 2, 0,
    ]);
    const epic = new LevelRules({ ...RULESET_FIELDS.defaults, lastLevel: 30 });
    expect([epic.countLevelsLeft(20), epic.countLevelsLeft(30)]).toEqual([10, 0]);
    // A character past a lowered last level, saved before, has none left
    const low = new LevelRules({ ...RULESET_FIELDS.defaults, lastLevel: 10 });
    expect(low.countLevelsLeft(12)).toBe(0);
  });

  test("give the SRD's epic bonuses past 20th: +1 on attacks at each odd level, +1 on saves at each even one", () => {
    const levels = [1, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
    // Table: Epic Save and Epic Attack Bonuses, none up to 20th
    expect(levels.map((level) => LevelRules.epicAttackBonus(level))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(levels.map((level) => LevelRules.epicSaveBonus(level))).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect([20, 21].map((level) => LevelRules.isNonepicLevel(level))).toEqual([true, false]);
  });
});
