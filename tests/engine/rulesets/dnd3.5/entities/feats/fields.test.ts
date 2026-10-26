import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { heldValues, writtenValues } from "@/tests/support/ownerValues.ts";
import {
  FEAT_FAMILY,
  FEAT_GENERATED,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A feat's fields", () => {
  test("are none without their values, and each family, school and rule with them", () => {
    expect(FEAT_FIELDS.read(OwnerValues.NONE)).toEqual(FEAT_FIELDS.defaults);
    expect(
      FEAT_FIELDS.read(
        heldValues([
          [FEAT_STACKABLE, true],
          [FEAT_FAMILY, "Weapon Focus"],
          [FEAT_FAMILY, "Fighter Bonus"],
          [FEAT_WEAPON_FINESSE, true],
          [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, false],
          [WIZARD_PROHIBITED_SCHOOL, "Evocation"],
          ["SOMETHING_ELSE", true],
        ]),
      ),
    ).toEqual({
      families: ["Weapon Focus", "Fighter Bonus"],
      generated: false,
      oversizedTwoWeaponFighting: false,
      prohibitedSchools: ["Evocation"],
      // A feat is selectable unless it says otherwise
      selectable: true,
      stackable: true,
      weaponFinesse: true,
    });
  });

  test("are kept in a value per family, school and rule, which read back as the fields", () => {
    const fields = {
      families: ["Spell Focus"],
      generated: false,
      oversizedTwoWeaponFighting: true,
      prohibitedSchools: ["Evocation", "Necromancy"],
      selectable: false,
      stackable: false,
      weaponFinesse: false,
    };
    const written = writtenValues(FEAT_FIELDS.write(fields));
    // Whether it stacks, is selectable or generated always written, false too
    const always = { [FEAT_STACKABLE]: [false], [FEAT_SELECTABLE]: [false], [FEAT_GENERATED]: [false] };
    expect(written.fields).toEqual({
      ...always,
      [FEAT_FAMILY]: ["Spell Focus"],
      [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING]: [true],
      [WIZARD_PROHIBITED_SCHOOL]: ["Evocation", "Necromancy"],
    });
    expect(FEAT_FIELDS.read(written)).toEqual(fields);
    expect(writtenValues(FEAT_FIELDS.write(FEAT_FIELDS.defaults))).toEqual({
      fields: { ...always, [FEAT_SELECTABLE]: [true] },
      links: {},
    });
    // Its form writes its families, its schools and its rules: the others aren't its form's
    expect(FEAT_FIELDS.formKeys).toEqual([
      "families",
      "weaponFinesse",
      "oversizedTwoWeaponFighting",
      "prohibitedSchools",
    ]);
  });
});
