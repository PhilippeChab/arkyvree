import { describe, expect, test } from "bun:test";

import { abilityName } from "@/client/src/pages/characters/details/components/dnd3.5/abilityName.ts";

/** A level's abilities, by their keys: their names without their spaces, lowercased. */
const ABILITIES = { forcepoints: { abilityId: "a1" }, strength: { abilityId: "a2" } };

describe("An ability's name", () => {
  test("is its ruleset's, its spaces kept", () => {
    expect(abilityName([{ id: "a1", name: "Force Points" }], ABILITIES, "a1")).toBe("Force Points");
  });

  test("is its key's while its ruleset's list loads, else its id", () => {
    expect(abilityName(undefined, ABILITIES, "a2")).toBe("Strength");
    expect(abilityName([], undefined, "a3")).toBe("a3");
  });
});
