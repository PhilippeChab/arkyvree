import { describe, expect, test } from "bun:test";

import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";

const PROPERTY_TYPES = Dnd35PropertyTypes.SHARED;

describe("The 3.5 property types", () => {
  test("leave out the spell's types no data holds: its level and saving throw, its material and duration type", () => {
    const dropped = ["SPELL_LEVEL", "SPELL_SAVING_THROW", "SPELL_MATERIAL", "SPELL_DURATION_TYPE"];
    const types = PROPERTY_TYPES.getTypes();
    expect(dropped.filter((type) => types.includes(type) || PROPERTY_TYPES.getValues(type))).toEqual([]);
  });
});
