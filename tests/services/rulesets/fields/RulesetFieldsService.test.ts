import { describe, expect, test } from "bun:test";

import { RulesetFieldsService } from "@/server/services/rulesets/fields/index.ts";
import { PROPERTY_ENTITY_TYPES } from "@/shared/customization/entities.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { SPELL_COMPONENTS, SPELL_SCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

describe("RulesetFieldsService", () => {
  test("gives each entity type's form its fields, and the ruleset's Settings', as the ruleset declares them", async () => {
    const { rulesetId } = await getSeedCtx();
    const fields = await RulesetFieldsService.getFields(rulesetId);
    expect(Object.keys(fields).toSorted()).toEqual([...PROPERTY_ENTITY_TYPES].toSorted());

    expect(fields.powers.map((field) => field.key)).toEqual([
      "school",
      "subschool",
      "descriptors",
      "components",
      "castingTime",
      "rangeType",
      "target",
      "effect",
      "areaOfEffect",
      "duration",
      "spellResistance",
    ]);
    expect(fields.powers).toContainEqual(
      expect.objectContaining({
        key: "school",
        label: "School",
        input: "choice",
        multiple: false,
        options: SPELL_SCHOOLS,
      }),
    );
    expect(fields.powers).toContainEqual(
      expect.objectContaining({ key: "components", input: "choice", multiple: true, options: SPELL_COMPONENTS }),
    );
    expect(fields.powers).toContainEqual(
      expect.objectContaining({
        key: "castingTime",
        input: "text",
        multiple: false,
        placeholder: 'e.g., "1 standard action"',
      }),
    );
    expect(fields.klasses).toEqual([
      expect.objectContaining({ key: "bonusSpellAbilityId", input: "ref", references: "abilities", required: false }),
      expect.objectContaining({ key: "casterType", input: "choice", options: ["Arcane", "Divine"] }),
    ]);
    expect(fields.klass_levels).toEqual([
      expect.objectContaining({ key: "bab", label: "Base Attack Bonus", input: "number", default: 0, min: 0 }),
      expect.objectContaining({ key: "skills", label: "Skill Points", input: "number", default: 0, min: 0 }),
    ]);
    expect(fields.skills).toContainEqual(
      expect.objectContaining({
        key: "checkPenaltyMultiplier",
        shownWhen: [{ path: "fields.impactedByWeight", values: [true] }],
      }),
    );
    expect(fields.rulesets).toEqual([
      expect.objectContaining({ key: "skillPointAbilityId", input: "ref", references: "abilities", required: true }),
      expect.objectContaining({ key: "featAdvancement", input: "progression", levels: 20, max: 10 }),
      expect.objectContaining({ key: "abilityIncreases", input: "progression", levels: 20, max: 1 }),
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
    const weapon = items.find((field) => field.key === "weapon");
    expect(weapon).toMatchObject({
      fields: expect.arrayContaining([
        expect.objectContaining({
          key: "weapon.proficiency",
          input: "choice",
          options: ["Simple", "Martial", "Exotic"],
        }),
        expect.objectContaining({ key: "weapon.finessable", input: "flag", nullable: true }),
      ]),
    });
    // The stats an armor and a shield both keep, held by the item itself: in each one's section, after its own
    expect(items.find((field) => field.key === "maxDex")).toBeUndefined();
    for (const section of ["armor", "shield"]) {
      const group = items.find((field) => field.key === section);
      const keys = group?.input === "group" ? group.fields.map((field) => field.key) : [];
      expect(keys).toEqual([
        `${section}.type`,
        `${section}.proficiency`,
        `${section}.acBonus`,
        "maxDex",
        "checkPenalty",
        "spellFailure",
      ]);
    }
  });
});
