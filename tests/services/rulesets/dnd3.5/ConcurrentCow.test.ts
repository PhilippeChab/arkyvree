import { afterAll, expect, test } from "bun:test";

import type { Feat, Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Entities, EntitySnapshots, Modifiers, type RulesetEntityType } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

const pool = createTestPool();

/**
 * A fork whose view was read while it inherited an entity (`sourceId`, of `entityType`), which another write copied
 * since, committed, and changed (`change`, given the copy's id): what a write whose view was read before that copy
 * reads.
 */
async function copiedSinceRead(
  entityType: RulesetEntityType,
  sourceId: string,
  change: (copyId: string) => Promise<unknown> = async () => undefined,
) {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  await withRulesetScope(db, fork.id, async () => undefined);
  const copy = await copyEntity(db, entityType, sourceId, fork);
  await change(copy.id);
  return { session, fork, copy };
}

afterAll(() => pool.end());

test("COW waits for a competing copy transaction and continues after rollback", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const copied = await runWhileLocked(
    pool,
    (blockerDb) => EntitySnapshots.lock(blockerDb, { rulesetId: fork.id, sourceEntityId: sourceId }),
    () => copyEntity(db, "feats", sourceId, fork),
  );
  expect(copied.id).not.toBe(sourceId);
  expect((await copyEntity(db, "feats", sourceId, fork)).id).toBe(copied.id);
  expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toHaveLength(1);
  expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: sourceId }))?.rulesetId).toBe(seed.rulesetId);
});

test("copy locks do not block other sources or other forks", async () => {
  const forkId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  await EntitySnapshots.lock(db, { rulesetId: forkId, sourceEntityId: sourceId });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '500ms'");
    const otherDb = createTestDbFromClient(client);
    await EntitySnapshots.lock(otherDb, { rulesetId: forkId, sourceEntityId: crypto.randomUUID() });
    await EntitySnapshots.lock(otherDb, { rulesetId: crypto.randomUUID(), sourceEntityId: sourceId });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});

test("a tombstoned copy can be recreated without duplicating snapshots", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  const first = await copyEntity(db, "feats", sourceId, fork);
  await Entities.delete<Feat>(db, { entityType: "feats", id: first.id });
  const second = await copyEntity(db, "feats", sourceId, fork);
  expect(second.id).not.toBe(first.id);
  const snapshots = await EntitySnapshots.findMany(db, { rulesetId: fork.id });
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].forkedEntityId).toBe(second.id);
});

test("an edit whose view was read before another write copied the entity is stale, its change kept", async () => {
  const source = (await Entities.findOne<Feat>(db, {
    entityType: "feats",
    id: (await getSeedCtx()).featMap.Toughness,
  }))!;
  const { session, fork, copy } = await copiedSinceRead("feats", source.id, (copyId) =>
    Entities.update(db, "feats", { description: "Theirs" }, { id: copyId }),
  );

  await expectRefusedWith(
    EntitiesService.updateEntity(session, fork.id, "feats", source.id, {
      name: source.name,
      description: "Mine",
      updatedAt: source.updatedAt,
    }),
    409,
  );
  expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: copy.id }))?.description).toBe("Theirs");
});

test("a customization edit whose view was read before another write copied its entity is stale", async () => {
  const sourceId = (await getSeedCtx()).featMap.Toughness;
  const [modifier] = await Modifiers.findMany(db, { sourceIds: [sourceId], sourceType: "feats" });
  const { session, fork } = await copiedSinceRead("feats", sourceId);

  await expectRefusedWith(
    ModifiersService.updateModifier(session, fork.id, "feats", sourceId, modifier.id, {
      operator: modifier.operator,
      target: modifier.target,
      value: "4",
      updatedAt: modifier.updatedAt,
    }),
    409,
  );
});

test("a progression save whose view was read before another write copied the class is stale, its change kept", async () => {
  const seeded = (await getSeedCtx()).rulesetId;
  const wizard = (await Entities.findOne<Klass>(db, { entityType: "classes", name: "Wizard", rulesetId: seeded }))!;
  const firstOf = async (classId: string) =>
    (await Entities.findMany<KlassLevel>(db, { entityType: "class-levels", ownerIds: [classId] })).find(
      (level) => level.position === 1,
    )!;
  const first = await firstOf(wizard.id);
  const { session, fork, copy } = await copiedSinceRead("classes", wizard.id, async (copyId) =>
    Entities.update(
      db,
      "class-levels",
      { fields: { [CLASS_LEVEL_SKILL_POINTS]: 9 } },
      { id: (await firstOf(copyId)).id },
    ),
  );

  await expectRefusedWith(
    EntitiesService.updateProgression(session, fork.id, "classes", wizard.id, {
      levels: [{ levelId: first.id, fields: { [CLASS_LEVEL_BAB]: 1, [CLASS_LEVEL_SKILL_POINTS]: 6 } }],
      ownedTokens: [{ id: first.id, updatedAt: first.updatedAt }],
    }),
    409,
  );
  expect((await firstOf(copy.id)).fields[CLASS_LEVEL_SKILL_POINTS]).toBe(9);
});
