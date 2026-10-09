import { describe, expect, test } from "bun:test";

import {
  featPickString,
  nextPickLevel,
  pendingLevelsOf,
  plannedPicker,
  skillPointString,
  spellSlotsPerLevel,
} from "@/client/src/pages/characters/details/components/dnd3.5/levelUp/pendingPicks.ts";

/** A planned Fighter 3, then a Wizard 1: Add Level's preview's levels. */
const FIGHTER_THEN_WIZARD = [
  { klassId: "fighter", klassLevelId: "f3", level: 3 },
  { klassId: "wizard", klassLevelId: "w1", level: 1 },
];

/** A wizard's spell slots over the same plan: none at the fighter level, cantrips and first-level spells at Wizard 1. */
const WIZARD_SPELL_SLOTS: Record<string, number>[] = [{}, { 0: 6, 1: 3 }];

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
    expect(pendingLevelsOf(levels, increases)).toEqual({
      pendingAbilityIds: "null,str,null",
      pendingKlassLevelIds: "f1,f2,w1",
    });
    expect(pendingLevelsOf(levels, increases, 1)).toEqual({ pendingAbilityIds: "null", pendingKlassLevelIds: "f1" });
  });

  test("sends no levels before the plan's preview has loaded", () => {
    const none = { pendingAbilityIds: undefined, pendingKlassLevelIds: undefined };
    expect(pendingLevelsOf(undefined, ["str"])).toEqual(none);
    expect(pendingLevelsOf([], [])).toEqual(none);
  });

  test("lists the skill points spent, leaving out a skill with none", () => {
    expect(skillPointString({ climb: 2, swim: 0, jump: 1 })).toBe("climb:2,jump:1");
    expect(skillPointString({ swim: 0 })).toBeUndefined();
  });
});

describe("the planned level a pick lands on", () => {
  test("is the first whose slots so far outnumber the picks, the last once they're all taken", () => {
    expect(nextPickLevel([0, 2, 1], 0)).toBe(1);
    expect(nextPickLevel([0, 2, 1], 1)).toBe(1);
    expect(nextPickLevel([0, 2, 1], 2)).toBe(2);
    expect(nextPickLevel([0, 2, 1], 3)).toBe(2);
    expect(nextPickLevel([], 0)).toBe(0);
  });

  test("counts a spell pool's slots at its open spell level, or every level's for a pool without", () => {
    expect(spellSlotsPerLevel(WIZARD_SPELL_SLOTS, 1)).toEqual([0, 3]);
    expect(spellSlotsPerLevel(WIZARD_SPELL_SLOTS, 4)).toEqual([0, 0]);
    expect(spellSlotsPerLevel(WIZARD_SPELL_SLOTS, null)).toEqual([0, 9]);
  });

  test("asks the picker for that level's class and level, after the planned levels up to it", () => {
    // A Fighter 3 then Wizard 1 plan: its wizard spells are picked at Wizard 1, never at the plan's first class
    const index = nextPickLevel(spellSlotsPerLevel(WIZARD_SPELL_SLOTS, 1), 0);
    expect(plannedPicker(FIGHTER_THEN_WIZARD, [null, "int"], index, "dodge:general")).toEqual({
      classId: "wizard",
      level: 1,
      selectedFeatPicks: "dodge:general",
      pendingAbilityIds: "null,int",
      pendingKlassLevelIds: "f3,w1",
      pendingFeatPicks: "dodge:general",
    });
    expect(plannedPicker(FIGHTER_THEN_WIZARD, [], 0, undefined)).toMatchObject({
      classId: "fighter",
      level: 3,
      pendingKlassLevelIds: "f3",
    });
  });

  test("leaves the picker's level unknown until the plan's preview has loaded", () => {
    expect(plannedPicker(undefined, [], 0, undefined)).toMatchObject({ classId: undefined, level: undefined });
  });
});
