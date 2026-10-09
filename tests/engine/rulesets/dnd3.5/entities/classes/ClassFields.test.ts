import { describe, expect, test } from "bun:test";

import ClassFields from "@/engine/rulesets/dnd3.5/entities/classes/ClassFields.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

describe("A class's fields", () => {
  test("are null without their properties, and their values with them", () => {
    expect(ClassFields.read([])).toEqual({ bonusSpellAbilityId: null, casterType: null });
    expect(
      ClassFields.read([
        { type: KLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });

  test("take a caster type only as one the engine casts by", () => {
    expect(ClassFields.read([{ type: KLASS_CASTER_TYPE, value: "Psionic" }]).casterType).toBeNull();
  });

  test("take the first row of a type, though a class's sync stores one", () => {
    expect(
      ClassFields.read([
        { type: KLASS_CASTER_TYPE, value: "Arcane" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
      ]).casterType,
    ).toBe("Arcane");
  });

  test("are kept in a property per field the class has, which reads back as the fields", () => {
    expect(ClassFields.toProperties({ bonusSpellAbilityId: null, casterType: null })).toEqual([]);
    const rows = ClassFields.toProperties({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
    expect(rows).toEqual([
      { type: KLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
      { type: KLASS_CASTER_TYPE, value: "Divine" },
    ]);
    expect(ClassFields.read(rows)).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });
});
