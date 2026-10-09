import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import RulesetFields, { RULESET_FIELD_PROPERTY_TYPES } from "@/engine/rulesets/dnd3.5/ruleset/RulesetFields.ts";
import { db } from "@/server/database/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

describe("A ruleset's own fields", () => {
  test("are none without their properties, and each from the first row of its type with them", () => {
    expect(RulesetFields.read([])).toEqual({ skillPointAbilityId: null });
    expect(
      RulesetFields.read([
        { type: "SOMETHING_ELSE", value: "1" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "wisdom" },
      ]),
    ).toEqual({ skillPointAbilityId: "intelligence" });
  });

  test("are kept in a property per field with a value", () => {
    expect(RulesetFields.toProperties({ skillPointAbilityId: null })).toEqual([]);
    expect(RulesetFields.toProperties({ skillPointAbilityId: "intelligence" })).toEqual([
      { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
    ]);
  });

  test("of every seeded ruleset rebuild its rows", async () => {
    const rows = await db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityType, "rulesets"));
    expect(rows.every((row) => RULESET_FIELD_PROPERTY_TYPES.includes(row.type))).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const stored of Map.groupBy(rows, (row) => row.entityId).values()) {
      const rebuilt = RulesetFields.toProperties(RulesetFields.read(stored));
      expect(rebuilt).toEqual(stored.map(({ type, value }) => ({ type, value })));
    }
  });
});
