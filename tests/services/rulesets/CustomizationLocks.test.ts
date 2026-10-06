import { afterAll, afterEach, expect, test } from "bun:test";

import { featsInRules } from "@/drizzle/schema.ts";
import { RulesetCache } from "@/server/cache/rulesetCache/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { lockEntityForMutation } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Feats, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { insertRows, runWhileLocked } from "@/tests/support/database.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const pool = createTestPool();

/**
 * The composed ruleset data a request reads can predate a concurrent delete (for example one that committed while this
 * request waited on the owner lock). Every customization kind re-reads its row after the lock and reports it missing.
 */
async function setupRemovedCustomizations() {
  const session = makeSession();
  const ruleset = await createSeededTestRuleset(session.userId);
  const [feat] = await insertRows(featsInRules, [{ name: "Removed Customizations", rulesetId: ruleset.id }]);
  const owner = { entityId: feat.id, entityType: "feats" };
  const [modifier] = await Modifiers.createMany(db, [
    {
      target: "abilities.strength.misc",
      value: "1",
      operator: "add",
      valueType: "number",
      sourceId: feat.id,
      sourceType: "feats",
    },
  ]);
  const [property] = await Properties.createMany(db, [{ ...owner, type: "NOTE", value: "Removed" }]);
  const [requirement] = await Requirements.createMany(db, [
    { ...owner, level: "1", target: "combat.bab", operator: "greater_than_or_equal", value: "1", valueType: "number" },
  ]);
  await withRulesetScope(db, ruleset.id, async () => {});
  await Modifiers.delete(db, { ids: [modifier.id] });
  await Properties.delete(db, { ids: [property.id] });
  await Requirements.delete(db, { ids: [requirement.id] });
  return { session, rulesetId: ruleset.id, featId: feat.id, modifier, property, requirement };
}
afterAll(() => pool.end());
afterEach(() => RulesetCache.invalidateAll());
test("owner mutation waits for a competing transaction and acquires the row after rollback", async () => {
  const seed = await getSeedCtx();
  await runWhileLocked(
    pool,
    async (blockerDb) => expect(await Feats.lock(blockerDb, { id: seed.featMap.Toughness })).toBe(true),
    () => lockEntityForMutation(db, "feats", seed.featMap.Toughness),
  );
});

test("owner locks leave other entities independent and shared copy reads compatible", async () => {
  const seed = await getSeedCtx();
  const otherId = Object.values(seed.featMap).find((id) => id !== seed.featMap.Toughness)!;
  await lockEntityForMutation(db, "feats", seed.featMap.Toughness);
  expect(await Feats.lock(db, { id: otherId }, "share")).toBe(true);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const other = createTestDbFromClient(client);
    expect(await Feats.lock(other, { id: otherId }, "share")).toBe(true);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("a missing owner is rejected before customization writes", async () => {
  await expect(lockEntityForMutation(db, "feats", crypto.randomUUID())).rejects.toThrow("no longer exists");
});

test("every customization kind reports a row removed before the owner lock as missing", async () => {
  const { session, rulesetId, featId, modifier, property, requirement } = await setupRemovedCustomizations();
  const mutations = [
    () =>
      ModifiersService.updateModifier(session, rulesetId, "feats", featId, modifier.id, {
        target: modifier.target,
        value: "2",
        operator: "add",
      }),
    () => ModifiersService.deleteModifier(session, rulesetId, "feats", featId, modifier.id),
    () =>
      PropertiesService.updateProperty(session, rulesetId, "feats", featId, property.id, {
        type: "NOTE",
        value: "Edited",
      }),
    () => PropertiesService.deleteProperty(session, rulesetId, "feats", featId, property.id),
    () => RequirementsService.updateRequirement(session, rulesetId, "feats", featId, requirement.id, { level: "1" }),
    () => RequirementsService.deleteRequirement(session, rulesetId, "feats", featId, requirement.id),
  ];
  for (const mutate of mutations) {
    await expect(mutate()).rejects.toThrow("no longer exists");
  }
});
