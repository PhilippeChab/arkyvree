import { describe, expect, test } from "bun:test";

import type { Item } from "@/engine/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Entities, Properties } from "@/server/repositories/index.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "@/vocabulary/dnd3.5/properties/index.ts";

describe("An item's properties", () => {
  test("are its template's of each type it doesn't set, then its own: its damage types replace all the template's", async () => {
    const ruleset = await createSeededTestRuleset(makeSession().userId);
    const longsword = await withRulesetScope(db, ruleset.id, async ({ rulesetData }) =>
      Dnd35View.of(rulesetData).items.find((item) => item.isTemplate && item.name === "Longsword"),
    );
    const [variant] = await Entities.createMany<Item>(db, "items", [
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

describe("A ruleset's own properties", () => {
  test("are each type's of the nearest ruleset of its chain that holds it, the fork's whatever its value", async () => {
    // Abilities whose ids sort first and last, before and after the source's: the view sorts every property by its value
    const abilityIds = Object.values((await getSeedCtx()).abilityMap).toSorted();
    for (const value of [abilityIds[0], abilityIds.at(-1)!]) {
      const fork = await createSeededTestRuleset(makeSession().userId);
      // A fork holds a copy of its source's as it's made: without it, it reads its chain's
      const type = RULESET_SKILL_POINT_ABILITY_ID;
      await Properties.delete(db, { entityIds: [fork.id], entityType: "rulesets", types: [type] });
      RulesetViews.invalidate(fork.id);
      const read = () =>
        withRulesetScope(db, fork.id, async ({ rulesetData }) =>
          rulesetData
            .rulesetPropertiesOf(fork.id)
            .map((row) => [row.entityId === fork.id ? "fork" : "source", row.type, row.value]),
        );
      expect(await read()).toEqual([["source", type, expect.any(String)]]);

      await Properties.createMany(db, [{ entityId: fork.id, entityType: "rulesets", type, value }]);
      RulesetViews.invalidate(fork.id);
      expect(await read()).toEqual([["fork", type, value]]);
    }
  });
});
