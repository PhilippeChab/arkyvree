import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import SkillFields, {
  NO_SKILL_FIELDS,
  SKILL_FIELD_PROPERTY_TYPES,
} from "@/engine/rulesets/dnd3.5/skills/SkillFields.ts";
import { db } from "@/server/database/index.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/shared/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("A skill's fields", () => {
  test("are none without their properties, and as stored with them", () => {
    expect(SkillFields.read([])).toEqual(NO_SKILL_FIELDS);
    expect(
      SkillFields.read([
        { type: SKILL_IMPACTED_BY_WEIGHT, value: "true" },
        { type: SKILL_CHECK_PENALTY_MULTIPLIER, value: "2" },
        { type: SKILL_USABLE_WITHOUT_TRAINING, value: "true" },
        { type: "SOMETHING_ELSE", value: "1" },
      ]),
    ).toEqual({ impactedByWeight: true, checkPenaltyMultiplier: 2, usableWithoutTraining: true });
  });

  test("take the multiplier from the first row of a positive number", () => {
    const multiplierOf = (...values: string[]) =>
      SkillFields.read(values.map((value) => ({ type: SKILL_CHECK_PENALTY_MULTIPLIER, value }))).checkPenaltyMultiplier;
    expect(multiplierOf("3", "2")).toBe(3);
    expect(multiplierOf("0", "-1", "2")).toBe(2);
    expect(multiplierOf("none")).toBe(1);
  });

  test("of every seeded skill rebuild its rows", async () => {
    const rows = await db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityType, "skills"));
    const rowsBySkill = Map.groupBy(rows, (row) => row.entityId);
    expect(rows.every((row) => SKILL_FIELD_PROPERTY_TYPES.includes(row.type))).toBe(true);
    expect(rowsBySkill.size).toBeGreaterThan(20);

    const mismatches = [...rowsBySkill].filter(
      ([, stored]) =>
        multiset(SkillFields.toProperties(SkillFields.read(stored))).join("|") !== multiset(stored).join("|"),
    );
    expect(mismatches).toEqual([]);
  });
});
