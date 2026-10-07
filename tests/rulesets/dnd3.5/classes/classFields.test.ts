import { describe, expect, test } from "bun:test";

import { readClassFields } from "@/server/rulesets/dnd3.5/classes/classFields.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

describe("A class's fields", () => {
  test("are null without their properties, and their values with them", () => {
    expect(readClassFields([])).toEqual({ bonusSpellAbilityId: null, casterType: null });
    expect(
      readClassFields([
        { type: KLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });

  test("take a caster type only as one the engine casts by", () => {
    expect(readClassFields([{ type: KLASS_CASTER_TYPE, value: "Psionic" }]).casterType).toBeNull();
  });

  test("take the first row of a type, though a class's sync stores one", () => {
    expect(
      readClassFields([
        { type: KLASS_CASTER_TYPE, value: "Arcane" },
        { type: KLASS_CASTER_TYPE, value: "Divine" },
      ]).casterType,
    ).toBe("Arcane");
  });
});
