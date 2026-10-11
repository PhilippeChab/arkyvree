import { describe, expect, test } from "bun:test";

import { EMPTY_NEW_CHARACTER } from "@/client/src/pages/characters/components/newCharacter.ts";

describe("A new character's form", () => {
  test("starts with every detail empty, its age too, and no ruleset, race, alignment or gender picked", () => {
    expect(EMPTY_NEW_CHARACTER.age).toBeNaN();
    expect(EMPTY_NEW_CHARACTER).toMatchObject({
      rulesetId: "",
      raceId: "",
      alignment: "",
      gender: "",
      height: "",
      weight: "",
      abilities: {},
    });
  });
});
