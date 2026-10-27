import { describe, expect, test } from "bun:test";

import { rulesetsInRules } from "@/drizzle/schema.ts";
import { OwnerValues } from "@/engine/core/fields/index.ts";
import { Engine } from "@/engine/index.ts";
import { RULESET_FIELDS } from "@/engine/rulesets/dnd3.5/ruleset/fields.ts";
import { db } from "@/server/database/index.ts";
import { RulesetSettings } from "@/server/repositories/index.ts";
import { findFormValues, heldValues, listValues, writtenValues } from "@/tests/support/ownerValues.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { RULESET_ABILITY_INCREASES, RULESET_FEAT_ADVANCEMENT } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The core rules' progression: a feat every 3 levels and one more at the first, an ability increase every 4. */
const CORE = {
  abilityIncreases: { every: 4, extra: [] },
  featAdvancement: { every: 3, extra: [{ amount: 1, level: 1 }] },
};

describe("A ruleset's own fields", () => {
  test("are the core rules' progression and no ability without their values, each off its field's values with them", () => {
    expect(RULESET_FIELDS.read(OwnerValues.NONE)).toEqual({ ...CORE, skillPointAbility: null });
    expect(
      RULESET_FIELDS.read(
        heldValues(
          [
            ["SOMETHING_ELSE", 1],
            ["skillPointAbility", "wisdom"],
            [RULESET_FEAT_ADVANCEMENT, "every:3"],
            [RULESET_FEAT_ADVANCEMENT, "3:1"],
            [RULESET_FEAT_ADVANCEMENT, "5:1"],
          ],
          { skillPointAbility: "intelligence" },
        ),
      ),
    ).toEqual({
      ...CORE,
      featAdvancement: {
        every: 3,
        extra: [
          { amount: 1, level: 3 },
          { amount: 1, level: 5 },
        ],
      },
      skillPointAbility: "intelligence",
    });
  });

  test("are kept in a value per field with a value, a progression's its frequency's and one per level more", () => {
    const written = (values: Partial<typeof RULESET_FIELDS.defaults>) => writtenValues(RULESET_FIELDS.write(values));
    expect(written({ skillPointAbility: null })).toEqual({ fields: {}, links: {} });
    expect(written({ skillPointAbility: "intelligence" })).toEqual({
      fields: {},
      links: { skillPointAbility: "intelligence" },
    });
    expect(written(CORE).fields).toEqual({
      [RULESET_FEAT_ADVANCEMENT]: ["every:3", "1:1"],
      [RULESET_ABILITY_INCREASES]: ["every:4"],
    });
  });

  test("written in part, as the seeder writes the skill point ability, keep the fields the write leaves out", async () => {
    const ruleset = await createTestRuleset(null);
    const intelligence = (await getSeedCtx()).abilityMap["Intelligence"];
    const progression = { featAdvancement: { every: 2, extra: [{ amount: 1, level: 3 }] } };
    await RulesetSettings.update(db, [{ id: ruleset.id, write: RULESET_FIELDS.write(progression) }]);

    const partial = RULESET_FIELDS.write({ skillPointAbility: intelligence });
    expect(partial).toEqual({ fields: {}, links: { skillPointAbility: intelligence } });
    await RulesetSettings.update(db, [{ id: ruleset.id, write: partial }]);
    expect(RULESET_FIELDS.read(await findFormValues("rulesets", ruleset.id))).toEqual({
      ...CORE,
      ...progression,
      skillPointAbility: intelligence,
    });
  });

  test("of every seeded ruleset rebuild its Settings", async () => {
    const rulesets = await db.select({ id: rulesetsInRules.id }).from(rulesetsInRules);
    const storage = Engine.storage();
    const held = (await RulesetSettings.findMany(db, { ids: rulesets.map(({ id }) => id) }))
      .map((ruleset) => storage.settingsOf(ruleset))
      .filter((stored) => listValues(stored).length > 0);
    expect(held.length).toBeGreaterThan(0);
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
