import { describe, expect, test } from "bun:test";

import AbilitiesComponent from "@/engine/rulesets/dnd3.5/model/abilities/AbilitiesComponent.ts";
import ClassesComponent from "@/engine/rulesets/dnd3.5/model/classes/ClassesComponent.ts";
import EncumbranceComponent from "@/engine/rulesets/dnd3.5/model/combat/EncumbranceComponent.ts";
import IdentityComponent from "@/engine/rulesets/dnd3.5/model/identity/IdentityComponent.ts";

/** A character's encumbrance, whose reduced speed reads neither its abilities nor its identity. */
function encumbrance() {
  return new EncumbranceComponent(new AbilitiesComponent(), new IdentityComponent(new ClassesComponent()));
}

describe("EncumbranceComponent", () => {
  test("slows a speed to two thirds, rounded up to 5 ft., as the SRD's table gives it", () => {
    const speeds = [20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(speeds.map((speed) => encumbrance().getEncumberedSpeed(speed))).toEqual([
      15, 20, 30, 35, 40, 50, 55, 60, 70,
    ]);
  });

  test("slows a speed the table doesn't list by the same rule", () => {
    const speeds = [5, 10, 15, 25, 35, 120];
    expect(speeds.map((speed) => encumbrance().getEncumberedSpeed(speed))).toEqual([5, 10, 10, 20, 25, 80]);
  });
});
