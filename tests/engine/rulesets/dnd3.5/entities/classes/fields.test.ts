import { describe, expect, test } from "bun:test";

import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import {
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
} from "@/shared/dnd3.5/properties/index.ts";

describe("A class's fields", () => {
  test("are null without their properties, and their values with them", () => {
    expect(CLASS_FIELDS.read([])).toEqual({ bonusSpellAbilityId: null, casterType: null });
    expect(
      CLASS_FIELDS.read([
        { type: KLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });

  test("take a caster type only as one the engine casts by", () => {
    expect(CLASS_FIELDS.read([{ type: KLASS_CASTER_TYPE, value: "Psionic" }]).casterType).toBeNull();
  });

  test("take the first row of a type, though a class's sync stores one", () => {
    expect(
      CLASS_FIELDS.read([
        { type: KLASS_CASTER_TYPE, value: "Arcane" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
      ]).casterType,
    ).toBe("Arcane");
  });

  test("are kept in a property per field the class has, which reads back as the fields", () => {
    expect(CLASS_FIELDS.toProperties({ bonusSpellAbilityId: null, casterType: null })).toEqual([]);
    const rows = CLASS_FIELDS.toProperties({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
    expect(rows).toEqual([
      { type: KLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
      { type: KLASS_CASTER_TYPE, value: "Divine" },
    ]);
    expect(CLASS_FIELDS.read(rows)).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });
});

describe("A class level's fields", () => {
  test("are 0 without their properties, and their numbers with them", () => {
    expect(CLASS_LEVEL_FIELDS.read([])).toEqual({ bab: 0, skills: 0 });
    expect(
      CLASS_LEVEL_FIELDS.read([
        { type: KLASS_LEVEL_BAB, value: "3" },
        { type: KLASS_LEVEL_SKILL_POINTS, value: "6" },
        { type: "SOMETHING_ELSE", value: "9" },
      ]),
    ).toEqual({ bab: 3, skills: 6 });
  });

  test("take the first row of a type, though a level's sync stores one", () => {
    expect(
      CLASS_LEVEL_FIELDS.read([
        { type: KLASS_LEVEL_BAB, value: "1" },
        { type: KLASS_LEVEL_BAB, value: "2" },
      ]).bab,
    ).toBe(1);
  });

  test("are kept in both properties, which read back as the fields", () => {
    const rows = CLASS_LEVEL_FIELDS.toProperties({ bab: 2, skills: 4 });
    expect(rows).toEqual([
      { type: KLASS_LEVEL_BAB, value: "2" },
      { type: KLASS_LEVEL_SKILL_POINTS, value: "4" },
    ]);
    expect(CLASS_LEVEL_FIELDS.read(rows)).toEqual({ bab: 2, skills: 4 });
  });
});
