import { describe, expect, test } from "bun:test";

import { readAbilityIncrease } from "@/codegen/dnd5.2/tools/detect/abilityIncreases.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd5.2/abilities.ts";

describe("A feat's ability score increase", () => {
  test("is any ability for one of the player's choice", () => {
    expect(readAbilityIncrease("Increase one ability score of your choice by 1, to a maximum of 30.")).toEqual({
      abilities: ABILITY_NAMES,
      amount: 1,
    });
  });

  test("is the abilities it names, two or more", () => {
    expect(readAbilityIncrease("Increase your Strength or Dexterity score by 1, to a maximum of 20.")).toEqual({
      abilities: ["Strength", "Dexterity"],
      amount: 1,
    });
    expect(readAbilityIncrease("Increase your Intelligence, Wisdom, or Charisma score by 1.")).toEqual({
      abilities: ["Intelligence", "Wisdom", "Charisma"],
      amount: 1,
    });
  });

  test("is none for a text without one", () => {
    expect(readAbilityIncrease("You gain a +2 bonus to attack rolls you make with Ranged weapons.")).toBeUndefined();
  });
});
