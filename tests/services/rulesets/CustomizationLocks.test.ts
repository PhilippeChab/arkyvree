import { afterAll, afterEach, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { featsInRules } from "@/drizzle/schema.ts";
import { invalidateAll } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Feats, Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { lockEntityForMutation, withRulesetScope } from "@/server/services/rulesets/cow/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { PropertiesService } from "@/server/services/rulesets/customization/properties/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { createSeededTestRuleset, getSeedCtx, insertRows, makeSession } from "@/tests/helpers.ts";

const pool = createTestPool();
afterAll(() => pool.end());
afterEach(invalidateAll);
test("owner mutation waits for a competing transaction and acquires the row after rollback", async () => {
  const seed = await getSeedCtx();
  const writer = await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  const blocker = await pool.connect();
  let locking: Promise<void> | undefined;
  try {
    await blocker.query("BEGIN");
    expect(await Feats.lock(createTestDbFromClient(blocker), { id: seed.featMap.Toughness })).toBe(true);
    locking = lockEntityForMutation(db, "feats", seed.featMap.Toughness);
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await blocker.query<{ waiting: boolean }>(
        "select pg_backend_pid() = ANY(pg_blocking_pids($1)) as waiting",
        [writer.rows[0].pid],
      );
      if (result.rows[0].waiting) {
        waiting = true;
        break;
      }
      await Bun.sleep(10);
    }
    expect(waiting).toBe(true);
    await blocker.query("ROLLBACK");
    await locking;
  } finally {
    try {
      await blocker.query("ROLLBACK");
      await locking;
    } finally {
      blocker.release();
    }
  }
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

// The composed ruleset data a request reads can predate a concurrent delete
// (for example one that committed while this request waited on the owner lock).
// Every customization kind re-reads its row after the lock and reports it missing.
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

test("every customization kind reports a row removed before the owner lock as missing", async () => {
  const { session, rulesetId, featId, modifier, property, requirement } = await setupRemovedCustomizations();
  const mutations = [
    () =>
      ModifiersService.updateEntityModifier(session, rulesetId, "feats", featId, modifier.id, {
        target: modifier.target,
        value: "2",
        operator: "add",
      }),
    () => ModifiersService.deleteEntityModifier(session, rulesetId, "feats", featId, modifier.id),
    () =>
      PropertiesService.updateEntityProperty(session, rulesetId, "feats", featId, property.id, {
        type: "NOTE",
        value: "Edited",
      }),
    () => PropertiesService.deleteEntityProperty(session, rulesetId, "feats", featId, property.id),
    () =>
      RequirementsService.updateEntityRequirement(session, rulesetId, "feats", featId, requirement.id, { level: "1" }),
    () => RequirementsService.deleteEntityRequirement(session, rulesetId, "feats", featId, requirement.id),
  ];
  for (const mutate of mutations) {
    await expect(mutate()).rejects.toThrow("no longer exists");
  }
});
