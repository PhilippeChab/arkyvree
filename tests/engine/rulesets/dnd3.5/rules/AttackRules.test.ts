import { describe, expect, test } from "bun:test";

import AttackRules from "@/engine/rulesets/dnd3.5/rules/AttackRules.ts";

describe("AttackRules", () => {
  test("give an attack a round for each 5 of a base attack bonus, four at most, past +20 too", () => {
    expect(AttackRules.listIterativeAttacks(0)).toEqual([0]);
    expect(AttackRules.listIterativeAttacks(6)).toEqual([6, 1]);
    expect(AttackRules.listIterativeAttacks(20)).toEqual([20, 15, 10, 5]);
    // An epic +21 or +26 adds to each attack, never a fifth
    expect(AttackRules.listIterativeAttacks(21)).toEqual([21, 16, 11, 6]);
    expect(AttackRules.listIterativeAttacks(26)).toEqual([26, 21, 16, 11]);
  });
});
