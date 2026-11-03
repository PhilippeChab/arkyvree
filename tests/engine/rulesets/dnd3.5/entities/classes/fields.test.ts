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
  test("are their defaults without their values (a hit die's d8), and their values with them: the bonus spell ability its link's", () => {
    expect(CLASS_FIELDS.read(OwnerValues.NONE)).toEqual({ bonusSpellAbility: null, casterType: null, hitDie: 8 });
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
    ).toEqual({ bonusSpellAbility: "wisdom-id", casterType: "Divine", hitDie: 8 });
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
    // Its hit die always written, its default as any other
    expect(CLASS_FIELDS.write({ bonusSpellAbility: null, casterType: null, hitDie: 8 })).toEqual({
      fields: { [CLASS_HD]: [8], [CLASS_CASTER_TYPE]: [] },
      links: { bonusSpellAbility: null },
    });
    const values = { bonusSpellAbility: "wisdom-id", casterType: "Divine", hitDie: 6 } as const;
    const written = writtenValues(CLASS_FIELDS.write(values));
    expect(written).toEqual({
      fields: { [CLASS_HD]: [6], [CLASS_CASTER_TYPE]: ["Divine"] },
      links: { bonusSpellAbility: "wisdom-id" },
    });
    expect(CLASS_FIELDS.read(written)).toEqual(values);
    // Its form writes them all: its hit die beside its name, its bonus spell ability and its caster type
    expect(CLASS_FIELDS.formNames).toEqual(["hitDie", "bonusSpellAbility", "casterType"]);
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
