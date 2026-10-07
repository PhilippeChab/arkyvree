import { describe, expect, test } from "bun:test";

import { computeAbilityModifier } from "@/client/src/components/characters/sections/dnd3.5/abilities.ts";

describe("A 3.5 ability score", () => {
  test("gives its modifier: +1 for every two points above 10, rounded down", () => {
    expect([1, 8, 9, 10, 11, 12, 18, 19].map(computeAbilityModifier)).toEqual([-5, -1, -1, 0, 0, 1, 4, 4]);
  });
});
