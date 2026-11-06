import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/pf1/ruleset/fields.ts";
import { db } from "@/server/database/index.ts";
import { RulesetSettings } from "@/server/repositories/index.ts";
import { listValues, writtenValues } from "@/tests/support/ownerValues.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

describe("A Pathfinder ruleset's own fields", () => {
  test("of every seeded ruleset rebuild its Settings, its skill rank ability among them", async () => {
    const rulesets = await db
      .select({ id: rulesetsInRules.id })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.baseRules, PF1_BASE_RULES));
    const storage = Engine.forRules(PF1_BASE_RULES).storage();
    const held = (await RulesetSettings.findMany(db, { ids: rulesets.map(({ id }) => id) }))
      .map((ruleset) => storage.settingsOf(ruleset))
      .filter((stored) => listValues(stored).length > 0);
    // The seeder links the core ruleset to the ability its skill ranks come from
    expect(held.some((stored) => "skillRankAbility" in stored.links)).toBe(true);
    for (const stored of held) {
      // A field the ruleset holds no value of reads as its default, which it doesn't store
      const { fields, links } = writtenValues(RULESET_FIELDS.write(RULESET_FIELDS.read(stored)));
      const rebuilt = {
        fields: Object.fromEntries(Object.entries(fields).filter(([field]) => field in stored.fields)),
        links: Object.fromEntries(Object.entries(links).filter(([role]) => role in stored.links)),
      };
      expect(listValues(rebuilt)).toEqual(listValues(stored));
    }
  });
});
