import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";
import Field from "@/engine/core/fields/Field.ts";
import {
  DAMAGE_TYPE,
  ENTITY_FIELDS,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The fields every module declares, 3.5's among them. */
const DECLARED = StorageEngine.shared().declaredFields();

describe("The 3.5 fields", () => {
  test("come in a stat block's order, each set's values in its options' order", () => {
    const fireball = [
      SPELL_RESISTANCE,
      SPELL_AREA_OF_EFFECT,
      SPELL_COMPONENT,
      SPELL_DURATION,
      SPELL_CASTING_TIME,
      SPELL_RANGE_TYPE,
      SPELL_DESCRIPTOR,
      SPELL_SCHOOL,
      "HOMEBREW_NOTE",
    ];
    expect(fireball.toSorted((a, b) => DECLARED.compareFields(a, b))).toEqual([
      SPELL_SCHOOL,
      SPELL_DESCRIPTOR,
      SPELL_COMPONENT,
      SPELL_CASTING_TIME,
      SPELL_RANGE_TYPE,
      SPELL_AREA_OF_EFFECT,
      SPELL_DURATION,
      SPELL_RESISTANCE,
      "HOMEBREW_NOTE",
    ]);
    expect(DECLARED.orderValues(SPELL_COMPONENT, ["Material", "Verbal", "Somatic"])).toEqual([
      "Verbal",
      "Somatic",
      "Material",
    ]);
  });

  test("merge every single link as the winning copy's alone, a class's bonus spell ability as its others", () => {
    const singles = StorageEngine.shared()
      .registries()
      .linkRoles.filter(({ single }) => single);
    expect(singles.map(({ fromType, role }) => DECLARED.roleMergeOf(fromType, role))).toEqual(
      singles.map(() => "winner"),
    );
    expect(DECLARED.roleMergeOf("classes", "bonusSpellAbility")).toBe("winner");
  });

  test("give a weapon's damage types in the rules' order: an urgrosh's Slashing, Piercing", () => {
    expect(DECLARED.orderValues(DAMAGE_TYPE, ["Piercing", "Slashing"])).toEqual(["Slashing", "Piercing"]);
  });

  test("leave out the spell's fields no data holds: its level and saving throw, its material and duration type", () => {
    const dropped = ["SPELL_LEVEL", "SPELL_SAVING_THROW", "SPELL_MATERIAL", "SPELL_DURATION_TYPE"];
    const declared = Object.values(ENTITY_FIELDS).flatMap((fields) =>
      Field.storedLeavesOf(fields).map((leaf) => leaf.field),
    );
    expect(dropped.filter((field) => declared.includes(field))).toEqual([]);
  });
});
