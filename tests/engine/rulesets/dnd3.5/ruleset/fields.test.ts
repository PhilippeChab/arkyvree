import { describe, expect, test } from "bun:test";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import {
  RULESET_ABILITY_INCREASES,
  RULESET_FEAT_ADVANCEMENT,
  RULESET_SKILL_POINT_ABILITY_ID,
} from "@/vocabulary/dnd3.5/properties/index.ts";

/** The core rules' progression: a feat every 3 levels and one more at the first, an ability increase every 4. */
const CORE = {
  abilityIncreases: { every: 4, extra: [] },
  featAdvancement: { every: 3, extra: [{ amount: 1, level: 1 }] },
};

describe("A ruleset's own fields", () => {
  test("are the core rules' progression and no ability without their properties, each off its type's rows with them", () => {
    expect(RULESET_FIELDS.read([])).toEqual({ ...CORE, skillPointAbilityId: null });
    expect(
      RULESET_FIELDS.read([
        { type: "SOMETHING_ELSE", value: "1" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
        { type: RULESET_SKILL_POINT_ABILITY_ID, value: "wisdom" },
        { type: RULESET_FEAT_ADVANCEMENT, value: "every:3" },
        { type: RULESET_FEAT_ADVANCEMENT, value: "3:1" },
        { type: RULESET_FEAT_ADVANCEMENT, value: "5:1" },
      ]),
    ).toEqual({
      ...CORE,
      featAdvancement: {
        every: 3,
        extra: [
          { amount: 1, level: 3 },
          { amount: 1, level: 5 },
        ],
      },
      skillPointAbilityId: "intelligence",
    });
  });

  test("are kept in a property per field with a value, a progression's its frequency's and one per level more", () => {
    expect(RULESET_FIELDS.toProperties({ skillPointAbilityId: null })).toEqual([]);
    expect(RULESET_FIELDS.toProperties({ skillPointAbilityId: "intelligence" })).toEqual([
      { type: RULESET_SKILL_POINT_ABILITY_ID, value: "intelligence" },
    ]);
    expect(RULESET_FIELDS.toProperties(CORE)).toEqual([
      { type: RULESET_FEAT_ADVANCEMENT, value: "every:3" },
      { type: RULESET_FEAT_ADVANCEMENT, value: "1:1" },
      { type: RULESET_ABILITY_INCREASES, value: "every:4" },
    ]);
  });

  test("of every seeded ruleset rebuild its rows", async () => {
    const rulesets = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules);
    const rows = await Properties.findMany(db, { entityIds: rulesets.map(({ id }) => id), entityType: "rulesets" });
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
