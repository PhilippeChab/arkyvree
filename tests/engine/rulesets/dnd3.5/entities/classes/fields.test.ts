import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import {
  CLASS_BONUS_SPELL_ABILITY_ID,
  CLASS_CASTER_TYPE,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
} from "@/vocabulary/dnd3.5/properties/index.ts";

describe("A class's fields", () => {
  test("are null without their values, and their values with them: the bonus spell ability its link's", () => {
    expect(CLASS_FIELDS.read(OwnerValues.NONE)).toEqual({ bonusSpellAbilityId: null, casterType: null });
    expect(
      CLASS_FIELDS.read(
        storedValues(
          [
            [CLASS_CASTER_TYPE, "Divine"],
            ["SOMETHING_ELSE", 1],
          ],
          { bonusSpellAbility: "wisdom-id" },
        ),
      ),
    ).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
  });

  test("take a caster type only as one the engine casts by", () => {
    expect(CLASS_FIELDS.read(storedValues([[CLASS_CASTER_TYPE, "Psionic"]])).casterType).toBeNull();
  });

  test("take the first value of a field, though a class's sync stores one", () => {
    expect(
      CLASS_FIELDS.read(
        storedValues([
          [CLASS_CASTER_TYPE, "Arcane"],
          [CLASS_CASTER_TYPE, "Divine"],
        ]),
      ).casterType,
    ).toBe("Arcane");
  });

  test("are kept in a property per field the class has, which reads back as the fields", () => {
    expect(CLASS_FIELDS.toProperties({ bonusSpellAbilityId: null, casterType: null })).toEqual([]);
    const rows = CLASS_FIELDS.toProperties({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine" });
    expect(rows).toEqual([
      { type: CLASS_BONUS_SPELL_ABILITY_ID, value: "wisdom-id" },
      { type: CLASS_CASTER_TYPE, value: "Divine" },
    ]);
    expect(CLASS_FIELDS.read(CLASS_FIELDS.storedOf(rows))).toEqual({
      bonusSpellAbilityId: "wisdom-id",
      casterType: "Divine",
    });
  });
});

describe("A class level's fields", () => {
  test("are 0 without their values, and their numbers with them", () => {
    expect(CLASS_LEVEL_FIELDS.read(OwnerValues.NONE)).toEqual({ bab: 0, skills: 0 });
    expect(
      CLASS_LEVEL_FIELDS.read(
        storedValues([
          [CLASS_LEVEL_BAB, 3],
          [CLASS_LEVEL_SKILL_POINTS, 6],
          ["SOMETHING_ELSE", 9],
        ]),
      ),
    ).toEqual({ bab: 3, skills: 6 });
  });

  test("take the first value of a field, though a level's sync stores one", () => {
    expect(
      CLASS_LEVEL_FIELDS.read(
        storedValues([
          [CLASS_LEVEL_BAB, 1],
          [CLASS_LEVEL_BAB, 2],
        ]),
      ).bab,
    ).toBe(1);
  });

  test("are kept in both properties, which read back as the fields", () => {
    const rows = CLASS_LEVEL_FIELDS.toProperties({ bab: 2, skills: 4 });
    expect(rows).toEqual([
      { type: CLASS_LEVEL_BAB, value: "2" },
      { type: CLASS_LEVEL_SKILL_POINTS, value: "4" },
    ]);
    expect(CLASS_LEVEL_FIELDS.read(CLASS_LEVEL_FIELDS.storedOf(rows))).toEqual({ bab: 2, skills: 4 });
  });
});
