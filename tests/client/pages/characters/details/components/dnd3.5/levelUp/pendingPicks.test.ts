import { describe, expect, test } from "bun:test";

import {
  featPickString,
  pendingLevelsOf,
  skillPointString,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/pendingPicks.ts";

/** A feat picked by its id. */
function feat(id: string) {
  return { id, name: id, aptitudeModifiers: [] };
}

describe("encoding a level wizard's picks for its pickers", () => {
  test("lists the picked feats by pool, in order", () => {
    expect(featPickString({ general: [feat("b"), feat("a")] })).toBe("a:general,b:general");
    expect(featPickString({})).toBeUndefined();
  });

  test("pairs each planned level's class level with its ability increase, up to the pick's level", () => {
    const levels = [{ klassLevelId: "f1" }, { klassLevelId: "f2" }, { klassLevelId: "w1" }];
    const increases = { 1: "str" };
    expect(pendingLevelsOf(levels, increases)).toEqual({
      pendingAbilityIds: "null,str,null",
      pendingKlassLevelIds: "f1,f2,w1",
    });
    expect(pendingLevelsOf(levels, increases, 1)).toEqual({ pendingAbilityIds: "null", pendingKlassLevelIds: "f1" });
  });

  test("sends no levels before the plan's preview has loaded", () => {
    const none = { pendingAbilityIds: undefined, pendingKlassLevelIds: undefined };
    expect(pendingLevelsOf(undefined, { 0: "str" })).toEqual(none);
    expect(pendingLevelsOf([], {})).toEqual(none);
  });

  test("lists the skill points spent, leaving out a skill with none", () => {
    expect(skillPointString({ climb: 2, swim: 0, jump: 1 })).toBe("climb:2,jump:1");
    expect(skillPointString({ swim: 0 })).toBeUndefined();
  });
});
