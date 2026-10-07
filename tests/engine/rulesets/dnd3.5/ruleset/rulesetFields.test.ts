import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import {
  readRulesetFields,
  RULESET_FIELD_PROPERTY_TYPES,
  toRulesetProperties,
} from "@/engine/rulesets/dnd3.5/ruleset/rulesetFields.ts";
import { db } from "@/server/database/index.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/shared/dnd3.5/properties/index.ts";

describe("A ruleset's own fields", () => {
  test("are none without their properties, and each from the first row of its type with them", () => {
    expect(readRulesetFields([])).toEqual({ skillPointAbilityId: null });
    expect(
      readRulesetFields([
        { type: "SOMETHING_ELSE", value: "1" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "wisdom" },
      ]),
    ).toEqual({ skillPointAbilityId: "intelligence" });
  });

  test("are stored as a row per field with a value", () => {
    expect(toRulesetProperties("ruleset", { skillPointAbilityId: null })).toEqual([]);
    expect(toRulesetProperties("ruleset", { skillPointAbilityId: "intelligence" })).toEqual([
      { entityId: "ruleset", entityType: "rulesets", type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
    ]);
  });

  test("of every seeded ruleset rebuild its rows", async () => {
    const rows = await db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityType, "rulesets"));
    expect(rows.every((row) => RULESET_FIELD_PROPERTY_TYPES.includes(row.type))).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const [rulesetId, stored] of Map.groupBy(rows, (row) => row.entityId)) {
      const rebuilt = toRulesetProperties(rulesetId, readRulesetFields(stored));
      expect(rebuilt.map(({ type, value }) => ({ type, value }))).toEqual(
        stored.map(({ type, value }) => ({ type, value })),
      );
    }
  });
});
