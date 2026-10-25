import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("A feat's fields", () => {
  test("are none without their values, and each family, school and rule with them", () => {
    expect(FEAT_FIELDS.read(OwnerValues.NONE)).toEqual(FEAT_FIELDS.defaults);
    expect(
      FEAT_FIELDS.read(
        storedValues([
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
      oversizedTwoWeaponFighting: false,
      prohibitedSchools: ["Evocation"],
      weaponFinesse: true,
    });
  });

  test("are kept in a value per family, school and rule, which read back as the fields", () => {
    const fields = {
      families: ["Spell Focus"],
      oversizedTwoWeaponFighting: true,
      prohibitedSchools: ["Evocation", "Necromancy"],
      weaponFinesse: false,
    };
    const written = OwnerValues.written(FEAT_FIELDS.write(fields));
    expect(written.fields).toEqual({
      [FEAT_FAMILY]: ["Spell Focus"],
      [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING]: [true],
      [WIZARD_PROHIBITED_SCHOOL]: ["Evocation", "Necromancy"],
    });
    expect(FEAT_FIELDS.read(written)).toEqual(fields);
    expect(OwnerValues.written(FEAT_FIELDS.write(FEAT_FIELDS.defaults))).toEqual(OwnerValues.NONE);
  });
});
