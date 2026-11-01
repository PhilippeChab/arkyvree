import { afterAll, expect, test } from "bun:test";

import type { Feat, Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db, setLockTimeout } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import {
  Entities,
  EntitySnapshots,
  Modifiers,
  Requirements,
  type RulesetEntityType,
  Rulesets,
} from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { copyEntity, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "@/vocabulary/dnd3.5/fields/index.ts";

const pool = createTestPool();

/**
 * A fork whose view was cached while it inherited an entity (`sourceId`, of `entityType`), which another write copied
 * since, committed, and changed (`change`, given the copy's id): what a client that read the entity before that copy
 * sends, its token its source's.
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

test("a fork's first edit waits for a write to its parent, then copies once", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  const sourceId = seed.featMap.Toughness;
  // The parent's write holds its lock: the fork's write, which holds its source chain shared, waits for it to end
  const copied = await runWhileLocked(
    pool,
    (blockerDb) => Rulesets.lockContent(blockerDb, { id: seed.rulesetId }),
    () => copyEntity(db, "feats", sourceId, fork),
  );
  expect(copied.id).not.toBe(sourceId);
  expect((await copyEntity(db, "feats", sourceId, fork)).id).toBe(copied.id);
  expect(await EntitySnapshots.findMany(db, { rulesetId: fork.id })).toHaveLength(1);
  expect((await Entities.findOne<Feat>(db, { entityType: "feats", id: seed.featMap.Toughness }))?.rulesetId).toBe(
    seed.rulesetId,
  );
});

test("a fork's write doesn't wait on a write to a ruleset outside its source chain", async () => {
  const seed = await getSeedCtx();
  const fork = await createSeededTestRuleset(SEED_USER_ID);
  // An extension the fork doesn't subscribe to, which another write holds
  const extension = (await Rulesets.findMany(db, { system: true })).find(
    (ruleset) => ruleset.kind === "extension" && ruleset.rulesetId === seed.rulesetId,
  )!;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await Rulesets.lockContent(createTestDbFromClient(client), { id: extension.id });
    // A wait would end at the lock timeout, refused
    await setLockTimeout(db, 2000);
    expect((await copyEntity(db, "feats", seed.featMap.Toughness, fork)).rulesetId).toBe(fork.id);
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

test("an edit of an entity another write copied since the client read it is stale, its change kept", async () => {
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

test("a customization change of a modifier or requirement another write copied since the client read it is stale", async () => {
  const sourceId = (await getSeedCtx()).featMap.Toughness;
  const [modifier] = await Modifiers.findMany(db, { sourceIds: [sourceId], sourceType: "feats" });
  const [requirement] = await Requirements.createMany(db, [
    {
      entityId: sourceId,
      entityType: "feats",
      level: "9",
      target: "combat.bab",
      operator: "greater_than_or_equal",
      value: "1",
      valueType: "number",
    },
  ]);
  const { session, fork } = await copiedSinceRead("feats", sourceId);

  // Each sent in turn: the client's ids are the source's, which the copy doesn't keep
  const changes = [
    () =>
      ModifiersService.updateModifier(session, fork.id, "feats", sourceId, modifier.id, {
        operator: modifier.operator,
        target: modifier.target,
        value: "4",
        updatedAt: modifier.updatedAt,
      }),
    () => ModifiersService.deleteModifier(session, fork.id, "feats", sourceId, modifier.id),
    () => RequirementsService.deleteRequirement(session, fork.id, "feats", sourceId, requirement.id),
  ];
  for (const change of changes) await expectRefusedWith(change(), 409);
});

test("a progression save of a class another write copied since the client read it is stale, its change kept", async () => {
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
