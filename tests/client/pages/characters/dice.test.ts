import { describe, expect, test } from "bun:test";

import { rollDice, rollDie } from "@/client/src/pages/characters/dice.ts";

describe("Dice", () => {
  test("roll between one and their sides", () => {
    for (let i = 0; i < 200; i++) expect(rollDie(6)).toBeWithin(1, 7);
  });

  test("sum the highest dice they keep: 4d6 dropping the lowest and 3d6 between 3 and 18", () => {
    for (let i = 0; i < 200; i++) {
      expect(rollDice({ count: 4, keep: 3, sides: 6 })).toBeWithin(3, 19);
      expect(rollDice({ count: 3, keep: 3, sides: 6 })).toBeWithin(3, 19);
    }
    expect(rollDice({ count: 5, keep: 0, sides: 6 })).toBe(0);
  });
});
