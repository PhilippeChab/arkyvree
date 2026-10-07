import { describe, expect, test } from "bun:test";

import { NO_FEAT_FIELDS, readFeatFields, toFeatProperties } from "@/engine/rulesets/dnd3.5/feats/featFields.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "@/shared/dnd3.5/properties/index.ts";

describe("A feat's fields", () => {
  test("are none without their properties, and each family, school and rule with them", () => {
    expect(readFeatFields([])).toEqual(NO_FEAT_FIELDS);
    expect(
      readFeatFields([
        { type: FEAT_FAMILY, value: "Weapon Focus" },
        { type: FEAT_FAMILY, value: "Fighter Bonus" },
        { type: FEAT_WEAPON_FINESSE, value: "true" },
        { type: FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, value: "false" },
        { type: WIZARD_PROHIBITED_SCHOOL, value: "Evocation" },
        { type: "SOMETHING_ELSE", value: "true" },
      ]),
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
    const rows = toFeatProperties(fields);
    expect(rows.map((row) => [row.type, row.value])).toEqual([
      [FEAT_FAMILY, "Spell Focus"],
      [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING, "true"],
      [WIZARD_PROHIBITED_SCHOOL, "Evocation"],
      [WIZARD_PROHIBITED_SCHOOL, "Necromancy"],
    ]);
    expect(readFeatFields(rows)).toEqual(fields);
    expect(toFeatProperties(NO_FEAT_FIELDS)).toEqual([]);
  });
});
