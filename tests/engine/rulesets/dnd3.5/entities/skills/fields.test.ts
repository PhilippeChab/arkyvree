import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { entitiesInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import type { FieldValue } from "@/engine/core/module/index.ts";
import { SKILL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/skills/fields.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { storedValues } from "@/tests/support/storedValues.ts";
import {
  SKILL_CHECK_PENALTY_MULTIPLIER,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** Rows as a sorted list of `type=value`. */
function multiset(rows: { type: string; value: string }[]) {
  return rows.map((row) => `${row.type}=${row.value}`).toSorted();
}

describe("A skill's fields", () => {
  test("are none without their values, and as stored with them", () => {
    expect(SKILL_FIELDS.read(OwnerValues.NONE)).toEqual(SKILL_FIELDS.defaults);
    expect(
      SKILL_FIELDS.read(
        storedValues([
          [SKILL_IMPACTED_BY_WEIGHT, true],
          [SKILL_CHECK_PENALTY_MULTIPLIER, 2],
          [SKILL_USABLE_WITHOUT_TRAINING, true],
          ["SOMETHING_ELSE", 1],
        ]),
      ),
    ).toEqual({ impactedByWeight: true, checkPenaltyMultiplier: 2, usableWithoutTraining: true });
  });

  test("take the multiplier from the first value of a positive number", () => {
    // On a skill armor weighs on: any other keeps 1
    const multiplierOf = (...values: FieldValue[]) =>
      SKILL_FIELDS.read(
        storedValues([
          [SKILL_IMPACTED_BY_WEIGHT, true],
          ...values.map((value): [string, FieldValue] => [SKILL_CHECK_PENALTY_MULTIPLIER, value]),
        ]),
      ).checkPenaltyMultiplier;
    expect(multiplierOf(3, 2)).toBe(3);
    expect(multiplierOf(0, -1, 2)).toBe(2);
    expect(multiplierOf("none")).toBe(1);
  });

  test("of every seeded skill rebuild its rows", async () => {
    const skills = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(eq(entitiesInRules.type, "skills"));
    const rows = await Properties.findMany(db, { entityIds: skills.map(({ id }) => id), entityType: "skills" });
    const rowsBySkill = Map.groupBy(rows, (row) => row.entityId);
    expect(rows.every((row) => SKILL_FIELDS.types.includes(row.type))).toBe(true);
    expect(rowsBySkill.size).toBeGreaterThan(20);

    const mismatches = [...rowsBySkill].filter(
      ([, stored]) =>
        multiset(SKILL_FIELDS.toProperties(SKILL_FIELDS.read(SKILL_FIELDS.storedOf(stored)))).join("|") !==
        multiset(stored).join("|"),
    );
    expect(mismatches).toEqual([]);
  });
});
