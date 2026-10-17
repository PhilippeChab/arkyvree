import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { propertiesInCustomization } from "@/drizzle/schema.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import { db } from "@/server/database/index.ts";
import {
  RULESET_ABILITY_INCREASES_PER_LEVEL,
  RULESET_FEATS_PER_LEVEL,
  RULESET_SKILL_POINT_ABILITY_ID,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** The core rules' feats at each character level: one at the first, then every third. */
const CORE_FEATS = [1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];

/** The core rules' ability increases at each character level: one every fourth. */
const CORE_INCREASES = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

describe("A ruleset's own fields", () => {
  test("are the core rules' progression and no ability without their properties, each off its type's rows with them", () => {
    const core = { abilityIncreasesPerLevel: CORE_INCREASES, featsPerLevel: CORE_FEATS };
    expect(RULESET_FIELDS.read([])).toEqual({ ...core, skillPointAbilityId: null });
    expect(
      RULESET_FIELDS.read([
        { type: "SOMETHING_ELSE", value: "1" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "wisdom" },
        { type: RULESET_FEATS_PER_LEVEL, value: "3:2" },
      ]),
    ).toEqual({
      ...core,
      featsPerLevel: [1, 0, 2, ...CORE_FEATS.slice(3)],
      skillPointAbilityId: "intelligence",
    });
  });

  test("are kept in a property per field with a value, a count per level's a row a level", () => {
    expect(RULESET_FIELDS.toProperties({ skillPointAbilityId: null })).toEqual([]);
    expect(RULESET_FIELDS.toProperties({ skillPointAbilityId: "intelligence" })).toEqual([
      { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
    ]);
    const rows = RULESET_FIELDS.toProperties({ abilityIncreasesPerLevel: CORE_INCREASES });
    expect(rows).toHaveLength(20);
    expect(rows.slice(0, 4)).toEqual(
      ["1:0", "2:0", "3:0", "4:1"].map((value) => ({ type: RULESET_ABILITY_INCREASES_PER_LEVEL, value })),
    );
  });

  test("of every seeded ruleset rebuild its rows", async () => {
    const rows = await db
      .select()
      .from(propertiesInCustomization)
      .where(eq(propertiesInCustomization.entityType, "rulesets"));
    expect(rows.every((row) => RULESET_FIELDS.types.includes(row.type))).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    for (const stored of Map.groupBy(rows, (row) => row.entityId).values()) {
      // A field the ruleset holds no row of reads as its default, which it doesn't store
      const types = new Set(stored.map(({ type }) => type));
      const rebuilt = RULESET_FIELDS.toProperties(RULESET_FIELDS.read(stored)).filter(({ type }) => types.has(type));
      expect(rebuilt).toEqual(stored.map(({ type, value }) => ({ type, value })));
    }
  });
});
