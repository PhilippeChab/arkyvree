import { describe, expect, test } from "bun:test";

import { valueError, valuesSet } from "@/client/src/pages/characters/details/components/levelUp/planValues.ts";

/** As a `value` step answers an advancement's bounds: 1 to its roll's most */
const D10 = { average: 5, max: 10, min: 1 };

const D4 = { average: 2, max: 4, min: 1 };

/** Two planned advancements, by their slots' keys */
const SLOTS = [{ key: 3 }, { key: 7 }];

describe("a level wizard's values", () => {
  test("take a whole number within the bounds the advancement's answer gives", () => {
    expect([valueError(1, D4), valueError(4, D4)]).toEqual([undefined, undefined]);
    expect([valueError(0, D4), valueError(5, D4), valueError(2.5, D4)]).toEqual([
      "Minimum 1",
      "Maximum 4",
      "Whole numbers only",
    ]);
  });

  test("are set once every advancement has its own, each one right", () => {
    expect(valuesSet([D10, D4], SLOTS, { 3: 10, 7: 3 })).toBe(true);
    expect(valuesSet([D10, D4], SLOTS, { 3: 10, 7: null })).toBe(false);
    expect(valuesSet([D10, D4], SLOTS, { 3: 10, 7: 5 })).toBe(false);
    // The bounds are still loading, or nothing is planned
    expect(valuesSet(undefined, SLOTS, { 3: 10, 7: 3 })).toBe(false);
    expect(valuesSet([], [], {})).toBe(false);
  });
});
