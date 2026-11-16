import { describe, expect, test } from "bun:test";

import AttackRules from "@/engine/rulesets/pf1/rules/AttackRules.ts";

describe("AttackRules", () => {
  test("give an attack a round for each 5 of a base attack bonus, four at most, past +20 too", () => {
    expect(AttackRules.listIterativeAttacks(0)).toEqual([0]);
    expect(AttackRules.listIterativeAttacks(6)).toEqual([6, 1]);
    expect(AttackRules.listIterativeAttacks(20)).toEqual([20, 15, 10, 5]);
    // A 25th-level fighter's +25: no fifth attack
    expect(AttackRules.listIterativeAttacks(25)).toEqual([25, 20, 15, 10]);
  });
});
