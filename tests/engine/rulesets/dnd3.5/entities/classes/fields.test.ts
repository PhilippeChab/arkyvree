import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { CLASS_FIELDS, CLASS_LEVEL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/classes/fields.ts";
import { heldValues, writtenValues } from "@/tests/support/ownerValues.ts";
import {
  CLASS_CASTER_TYPE,
  CLASS_HD,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A class's fields", () => {
  test("are null without their values, and their values with them: the bonus spell ability its link's", () => {
    expect(CLASS_FIELDS.read(OwnerValues.NONE)).toEqual({ bonusSpellAbilityId: null, casterType: null, hitDie: null });
    expect(
      CLASS_FIELDS.read(
        heldValues(
          [
            [CLASS_HD, 8],
            [CLASS_CASTER_TYPE, "Divine"],
            ["SOMETHING_ELSE", 1],
          ],
          { bonusSpellAbility: "wisdom-id" },
        ),
      ),
    ).toEqual({ bonusSpellAbilityId: "wisdom-id", casterType: "Divine", hitDie: 8 });
  });

  test("take a caster type only as one the engine casts by", () => {
    expect(CLASS_FIELDS.read(heldValues([[CLASS_CASTER_TYPE, "Psionic"]])).casterType).toBeNull();
  });

  test("take the first value of a field, though a class's sync stores one", () => {
    expect(
      CLASS_FIELDS.read(
        heldValues([
          [CLASS_CASTER_TYPE, "Arcane"],
          [CLASS_CASTER_TYPE, "Divine"],
        ]),
      ).casterType,
    ).toBe("Arcane");
  });

  test("are kept as the class's fields, its bonus spell ability its link, which read back as the fields", () => {
    expect(CLASS_FIELDS.write({ bonusSpellAbilityId: null, casterType: null, hitDie: null })).toEqual({
      fields: { [CLASS_HD]: [], [CLASS_CASTER_TYPE]: [] },
      links: { bonusSpellAbility: null },
    });
    const values = { bonusSpellAbilityId: "wisdom-id", casterType: "Divine", hitDie: 6 } as const;
    const written = writtenValues(CLASS_FIELDS.write(values));
    expect(written).toEqual({
      fields: { [CLASS_HD]: [6], [CLASS_CASTER_TYPE]: ["Divine"] },
      links: { bonusSpellAbility: "wisdom-id" },
    });
    expect(CLASS_FIELDS.read(written)).toEqual(values);
    // Its form writes its caster type and its bonus spell ability; its hit die is a column of its own
    expect(CLASS_FIELDS.formKeys).toEqual(["bonusSpellAbilityId", "casterType"]);
  });
});

describe("A class level's fields", () => {
  test("are 0 without their values, and their numbers with them", () => {
    expect(CLASS_LEVEL_FIELDS.read(OwnerValues.NONE)).toEqual({ bab: 0, skills: 0 });
    expect(
      CLASS_LEVEL_FIELDS.read(
        heldValues([
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
        heldValues([
          [CLASS_LEVEL_BAB, 1],
          [CLASS_LEVEL_BAB, 2],
        ]),
      ).bab,
    ).toBe(1);
  });

  test("are kept in both fields, as numbers, which read back as the fields", () => {
    const written = writtenValues(CLASS_LEVEL_FIELDS.write({ bab: 2, skills: 4 }));
    expect(written.fields).toEqual({ [CLASS_LEVEL_BAB]: [2], [CLASS_LEVEL_SKILL_POINTS]: [4] });
    expect(CLASS_LEVEL_FIELDS.read(written)).toEqual({ bab: 2, skills: 4 });
  });
});
