import { describe, expect, test } from "bun:test";

import { OwnerValues } from "@/engine/core/fields/index.ts";
import { FEAT_FIELDS } from "@/engine/rulesets/dnd3.5/entities/feats/fields.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/vocabulary/dnd3.5/properties/index.ts";

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

  test("are kept in a property per family, school and rule, which read back as the fields", () => {
    const fields = {
      families: ["Spell Focus"],
      oversizedTwoWeaponFighting: true,
      prohibitedSchools: ["Evocation", "Necromancy"],
      weaponFinesse: false,
    };
    const rows = FEAT_FIELDS.toProperties(fields);
    expect(rows.map((row) => [row.type, row.value])).toEqual([
      [FEAT_FAMILY, "Spell Focus"],
      [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, "true"],
      [WIZARD_PROHIBITED_SCHOOL, "Evocation"],
      [WIZARD_PROHIBITED_SCHOOL, "Necromancy"],
    ]);
    expect(FEAT_FIELDS.read(FEAT_FIELDS.storedOf(rows))).toEqual(fields);
    expect(FEAT_FIELDS.toProperties(FEAT_FIELDS.defaults)).toEqual([]);
  });
});
