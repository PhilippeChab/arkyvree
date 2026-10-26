import { describe, expect, test } from "bun:test";

import type { FormField } from "@/engine/core/fields/index.ts";
import { Engine } from "@/engine/index.ts";
import { RulesetFieldsService } from "@/server/services/rulesets/fields/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  CLASS_CASTER_TYPE,
  CLASS_LEVEL_BAB,
  CLASS_LEVEL_SKILL_POINTS,
  ITEM_SPELL_FAILURE,
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
  WEAPON_FINESSABLE,
  WEAPON_PROFICIENCY,
} from "@/vocabulary/dnd3.5/fields/index.ts";
import { SPELL_COMPONENTS, SPELL_SCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

/** Where a form's field sends its value: its stored field, a reference its link's role; a group, its label. */
function placeOf(field: FormField) {
  return field.input === "group" ? field.label : (field.field ?? field.role);
}

describe("RulesetFieldsService", () => {
  test("gives each entity type's form its fields, and the ruleset's Settings', as the ruleset declares them", async () => {
    const { rulesetId } = await getSeedCtx();
    const fields = await RulesetFieldsService.getFields(rulesetId);
    // A language's form shows none: its type is a column of its form
    expect(Object.keys(fields).toSorted()).toEqual(
      Engine.storage()
        .fieldOwners()
        .filter((type) => type !== "languages")
        .toSorted(),
    );

    expect(fields.spells.map(placeOf)).toEqual([
      SPELL_SCHOOL,
      SPELL_SUBSCHOOL,
      SPELL_DESCRIPTOR,
      SPELL_COMPONENT,
      SPELL_CASTING_TIME,
      SPELL_RANGE_TYPE,
      SPELL_TARGET,
      SPELL_EFFECT,
      SPELL_AREA_OF_EFFECT,
      SPELL_DURATION,
      SPELL_RESISTANCE,
    ]);
    // Each by its stored field alone, which a form sends it by
    expect(fields.spells.every((field) => !("key" in field))).toBe(true);
    expect(fields.spells).toContainEqual(
      expect.objectContaining({
        field: SPELL_SCHOOL,
        label: "School",
        input: "choice",
        multiple: false,
        options: SPELL_SCHOOLS,
      }),
    );
    expect(fields.spells).toContainEqual(
      expect.objectContaining({ field: SPELL_COMPONENT, input: "choice", multiple: true, options: SPELL_COMPONENTS }),
    );
    expect(fields.spells).toContainEqual(
      expect.objectContaining({
        field: SPELL_CASTING_TIME,
        input: "text",
        multiple: false,
        placeholder: 'e.g., "1 standard action"',
      }),
    );
    expect(fields.classes).toEqual([
      expect.objectContaining({ role: "bonusSpellAbility", input: "ref", references: "abilities", required: false }),
      expect.objectContaining({ field: CLASS_CASTER_TYPE, input: "choice", options: ["Arcane", "Divine"] }),
    ]);
    expect(fields.class_levels).toEqual([
      expect.objectContaining({
        field: CLASS_LEVEL_BAB,
        label: "Base Attack Bonus",
        input: "number",
        default: 0,
        min: 0,
      }),
      expect.objectContaining({
        field: CLASS_LEVEL_SKILL_POINTS,
        label: "Skill Points",
        input: "number",
        default: 0,
        min: 0,
      }),
    ]);
    expect(fields.skills).toContainEqual(
      expect.objectContaining({
        field: SKILL_CHECK_PENALTY_MULTIPLIER,
        shownWhen: [{ path: `fields.${SKILL_IMPACTED_BY_WEIGHT}`, values: [true] }],
      }),
    );
    expect(fields.rulesets).toEqual([
      expect.objectContaining({ role: "skillPointAbility", input: "ref", references: "abilities", required: true }),
      expect.objectContaining({ field: RULESET_FEAT_ADVANCEMENT, input: "progression", levels: 20, max: 10 }),
      expect.objectContaining({ field: RULESET_ABILITY_INCREASES, input: "progression", levels: 20, max: 1 }),
    ]);
  });

  test("groups an item's weapon, armor and shield, each shown for an item of that type, its stats in it", async () => {
    const { rulesetId } = await getSeedCtx();
    const { items } = await RulesetFieldsService.getFields(rulesetId);
    const groups = items.flatMap((field) =>
      field.input === "group" ? [[field.label, field.shownWhen?.[0].values]] : [],
    );
    expect(groups).toEqual([
      ["Weapon", ["Weapon"]],
      ["Armor", ["Armor"]],
      ["Shield", ["Shield"]],
    ]);
    const weapon = items.find((field) => placeOf(field) === "Weapon");
    expect(weapon).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          field: WEAPON_PROFICIENCY,
          input: "choice",
          options: ["Simple", "Martial", "Exotic"],
        }),
        expect.objectContaining({ field: WEAPON_FINESSABLE, input: "flag", nullable: true }),
      ]),
    });
    // The stats an armor and a shield both keep, held by the item itself: in each one's section, after its own
    expect(items.find((field) => placeOf(field) === ARMOR_MAX_DEX)).toBeUndefined();
    const own = {
      Armor: [ARMOR_TYPE, ARMOR_PROFICIENCY, ARMOR_AC_BONUS],
      Shield: [SHIELD_TYPE, SHIELD_PROFICIENCY, SHIELD_AC_BONUS],
    };
    for (const [section, fieldsOf] of Object.entries(own)) {
      const group = items.find((field) => placeOf(field) === section);
      const places = group?.input === "group" ? group.fields.map(placeOf) : [];
      expect(places).toEqual([...fieldsOf, ARMOR_MAX_DEX, ARMOR_CHECK_PENALTY, ITEM_SPELL_FAILURE]);
    }
  });
});
