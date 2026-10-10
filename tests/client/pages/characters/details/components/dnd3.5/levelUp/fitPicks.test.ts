import { describe, expect, test } from "bun:test";

import {
  fitSkillPoints,
  keepFitted,
  openPoolOf,
  withoutPick,
  withPick,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/fitPicks.ts";

/** A feat pool with `available` room. */
function featPool(id: string, available: number) {
  return { id, name: id, allowed: available, spent: 0, available, shared: false };
}

/** A feat or a spell picked. */
function pick(id: string) {
  return { id, name: id };
}

describe("keeping the picks a step says fit", () => {
  test("keeps the form's own picks the step keeps, in their order, and drops the others", () => {
    const feats = { general: [pick("Dodge"), pick("Mobility")], fighter: [pick("Cleave")] };
    expect(keepFitted(feats, { general: ["Dodge"] })).toEqual({ general: [pick("Dodge")], fighter: [] });
  });

  test("keeps a pick given twice once, as the step counts it", () => {
    expect(keepFitted({ general: [pick("Toughness"), pick("Toughness")] }, { general: ["Toughness"] })).toEqual({
      general: [pick("Toughness")],
    });
  });

  test("keeps picks that fit as the same object, and every pick until the step answers for them", () => {
    const feats = { general: [pick("Dodge")] };
    expect(keepFitted(feats, { general: ["Dodge"] })).toBe(feats);
    expect(keepFitted(feats, undefined)).toBe(feats);
  });

  test("closes the picker of a pool with no room", () => {
    const pools = { general: featPool("general", 1), bonus: featPool("bonus", 0) };
    expect([openPoolOf("general", pools), openPoolOf("bonus", pools), openPoolOf(null, pools)]).toEqual([
      "general",
      null,
      null,
    ]);
  });

  test("adds a pick last in its pool, and removes one", () => {
    expect(withPick({ bard: [pick("a")] }, "bard", pick("b"))).toEqual({ bard: [pick("a"), pick("b")] });
    expect(withPick({}, "bard", pick("a"))).toEqual({ bard: [pick("a")] });
    expect(withoutPick({ bard: [pick("a"), pick("b")] }, "bard", "a")).toEqual({ bard: [pick("b")] });
  });
});

describe("fitting a level's skill points", () => {
  // As the step answers them: Climb keeps up to 4 points, Swim 2 with Climb's spent
  const skills = [
    { id: "climb", ranksByPoints: [0, 1, 2, 3, 4] },
    { id: "swim", ranksByPoints: [0, 1, 2] },
  ];

  test("caps a skill at the most points its step answer keeps, in the order given", () => {
    expect(fitSkillPoints({ climb: 5, swim: 3 }, skills)).toEqual({ climb: 4, swim: 2 });
  });

  test("drops a skill the step doesn't list, and points that buy nothing", () => {
    expect(fitSkillPoints({ climb: 2, gone: 3, swim: 0 }, skills)).toEqual({ climb: 2 });
  });

  test("keeps points that fit, and every point while the step loads", () => {
    const allocations = { climb: 2 };
    expect(fitSkillPoints(allocations, skills)).toBe(allocations);
    expect(fitSkillPoints(allocations, undefined)).toBe(allocations);
  });
});
