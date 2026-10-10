import { describe, expect, test } from "bun:test";

import {
  featPickString,
  pickPairString,
  plannedLevelsOf,
  plannedPicker,
  skillPointString,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/pendingPicks.ts";

/** A planned Fighter 3, then a Wizard 1: Add Level's preview's levels. */
const FIGHTER_THEN_WIZARD = [
  { klassId: "fighter", klassLevelId: "f3", level: 3 },
  { klassId: "wizard", klassLevelId: "w1", level: 1 },
];

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
    const increases = [null, "str", null];
    expect(plannedLevelsOf(levels, increases)).toEqual({
      plannedAbilityIncreases: ",str:1,",
      plannedClassLevelIds: "f1,f2,w1",
    });
    expect(plannedLevelsOf(levels, increases, 2)).toEqual({
      plannedAbilityIncreases: ",str:1",
      plannedClassLevelIds: "f1,f2",
    });
  });

  test("sends no levels before the plan's preview has loaded", () => {
    const none = { plannedAbilityIncreases: undefined, plannedClassLevelIds: undefined };
    expect(plannedLevelsOf(undefined, ["str"])).toEqual(none);
    expect(plannedLevelsOf([], [])).toEqual(none);
  });

  test("lists a level's picks for its steps by pool, in the order they were picked", () => {
    expect(pickPairString({ general: [feat("b"), feat("a")], bonus: [feat("c")] })).toBe("b:general,a:general,c:bonus");
    expect(pickPairString({ general: [] })).toBeUndefined();
  });

  test("lists the skill points spent, leaving out a skill with none", () => {
    expect(skillPointString({ climb: 2, swim: 0, jump: 1 })).toBe("climb:2,jump:1");
    expect(skillPointString({ swim: 0 })).toBeUndefined();
  });
});

describe("the picker at the planned level a pick lands on", () => {
  test("asks for that level's class, level and ability increase, after the planned levels before it", () => {
    // A Fighter 3 then Wizard 1 plan: its wizard spells land on Wizard 1 (the preview's next pick level), never on the
    // plan's first class
    expect(plannedPicker(FIGHTER_THEN_WIZARD, [null, "int"], 1, "dodge:general")).toEqual({
      abilityId: "int",
      classId: "wizard",
      level: 1,
      featPicks: "dodge:general",
      plannedAbilityIncreases: "",
      plannedClassLevelIds: "f3",
    });
    expect(plannedPicker(FIGHTER_THEN_WIZARD, [], 0, undefined)).toMatchObject({
      classId: "fighter",
      level: 3,
      plannedClassLevelIds: undefined,
    });
  });

  test("leaves the picker's level unknown until the plan's preview has loaded", () => {
    expect(plannedPicker(undefined, [], 0, undefined)).toMatchObject({ classId: undefined, level: undefined });
  });
});
