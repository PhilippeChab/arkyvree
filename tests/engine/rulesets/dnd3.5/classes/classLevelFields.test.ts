import { describe, expect, test } from "bun:test";

import { readClassLevelFields, toClassLevelProperties } from "@/engine/rulesets/dnd3.5/classes/classLevelFields.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/shared/dnd3.5/properties/index.ts";

describe("A class level's fields", () => {
  test("are 0 without their properties, and their numbers with them", () => {
    expect(readClassLevelFields([])).toEqual({ bab: 0, skills: 0 });
    expect(
      readClassLevelFields([
        { type: KLASS_LEVEL_BAB, value: "3" },
        { type: KLASS_LEVEL_SKILL_POINTS, value: "6" },
        { type: "SOMETHING_ELSE", value: "9" },
      ]),
    ).toEqual({ bab: 3, skills: 6 });
  });

  test("take the first row of a type, though a level's sync stores one", () => {
    expect(
      readClassLevelFields([
        { type: KLASS_LEVEL_BAB, value: "1" },
        { type: KLASS_LEVEL_BAB, value: "2" },
      ]).bab,
    ).toBe(1);
  });

  test("are kept in both properties, which read back as the fields", () => {
    const rows = toClassLevelProperties({ bab: 2, skills: 4 });
    expect(rows).toEqual([
      { type: KLASS_LEVEL_BAB, value: "2" },
      { type: KLASS_LEVEL_SKILL_POINTS, value: "4" },
    ]);
    expect(readClassLevelFields(rows)).toEqual({ bab: 2, skills: 4 });
  });
});
