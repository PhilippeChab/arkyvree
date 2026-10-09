import { describe, expect, test } from "bun:test";

import { itemsInRules } from "@/drizzle/schema.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import { insertRows } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { makeSession } from "@/tests/support/users.ts";

describe("An item's properties", () => {
  test("are its template's of each type it doesn't set, then its own: its damage types replace all the template's", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const longsword = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) =>
      rulesetData.items.find((item) => item.isTemplate && item.name === "Longsword"),
    );
    const [variant] = await insertRows(itemsInRules, [
      { name: "Probe Blade", rulesetId: ruleset.id, sourceItemId: longsword!.id, type: "Weapon" },
    ]);
    await Properties.createMany(db, [
      { entityId: variant.id, entityType: "items", type: "DAMAGE_TYPE", value: "Piercing" },
      { entityId: variant.id, entityType: "items", type: "DAMAGE_TYPE", value: "Slashing" },
      { entityId: variant.id, entityType: "items", type: "WEAPON_BASE_DAMAGE", value: "1d10" },
    ]);
    // The cache read the ruleset before the variant was made
    RulesetViews.invalidate(ruleset.id);

    const properties = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) => ({
      plain: rulesetData.itemProperties(longsword!),
      own: rulesetData.propertiesByEntity.get(variant.id) ?? [],
      variant: rulesetData.itemProperties(variant),
    }));
    const pairs = (rows: { type: string; value: string }[]) => rows.map((row) => `${row.type}=${row.value}`);
    expect(pairs(properties.own).toSorted()).toEqual([
      "DAMAGE_TYPE=Piercing",
      "DAMAGE_TYPE=Slashing",
      "WEAPON_BASE_DAMAGE=1d10",
    ]);
    expect(pairs(properties.variant)).toEqual([
      ...pairs(properties.plain).filter((pair) => !pair.startsWith("DAMAGE_TYPE=") && !pair.startsWith("WEAPON_BASE_")),
      ...pairs(properties.own),
    ]);
    expect(pairs(properties.plain)).toContain("DAMAGE_TYPE=Slashing");
  });
});
