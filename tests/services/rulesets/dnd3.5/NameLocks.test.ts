/**
 * What a write that takes a name reads once its lock lets it run (`EntityNames.lock`): what another transaction that
 * held the lock first committed. The rows each test reads are written outside its transaction, on a connection of the
 * pool's, where the blocking transaction can read and change them, and deleted once the file's tests ran.
 */

import { afterAll, expect, test } from "bun:test";

import type { InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import type { rulesetsInRules } from "@/drizzle/schema.ts";
import type { Aptitude, Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import {
  Entities,
  EntitySnapshots,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  RulesetExtensions,
  Rulesets,
} from "@/server/repositories/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { DND35_BASE_RULES } from "@/vocabulary/dnd3.5/baseRules.ts";
import { SPELL_SCHOOL } from "@/vocabulary/dnd3.5/fields/index.ts";

/** The rulesets the tests committed, in the order they were made: deleted, newest first, once the tests ran. */
const COMMITTED_RULESET_IDS: string[] = [];

const pool = createTestPool();

/** How many feats of a name the ruleset's view shows. */
async function countFeats(rulesetId: string, name: string) {
  return await withRulesetScope(
    db,
    rulesetId,
    async ({ rulesetData }) => Dnd35View.of(rulesetData).feats.filter((feat: Feat) => feat.name === name).length,
  );
}

/** A fork of `parentId`, written outside the test's transaction, the seed user's (`session`), with `values`. */
async function createCommittedFork(
  committed: Db,
  parentId: string,
  values: Partial<InferInsertModel<typeof rulesetsInRules>> = {},
) {
  const session = makeSession();
  const fork = await createCommittedRuleset(committed, {
    userId: session.userId,
    rulesetId: parentId,
    ancestorRulesetIds: [parentId],
    ...values,
  });
  return { session, fork };
}

/** A ruleset written outside the test's transaction (`committed`), of 3.5's base rules, a fork when `values` says so. */
async function createCommittedRuleset(committed: Db, values: Partial<InferInsertModel<typeof rulesetsInRules>>) {
  const [ruleset] = await Rulesets.create(committed, {
    name: `Probe ${uniqueId()}`,
    description: "",
    private: true,
    baseRules: DND35_BASE_RULES,
    userId: null,
    system: values.userId === undefined,
    ...values,
  });
  COMMITTED_RULESET_IDS.push(ruleset.id);
  return ruleset;
}

/**
 * The fork deletes its copy of an entity of its parent's (`source`, of `entityType`): a tombstone hides
 * it, which a restore drops.
 */
async function deleteCommittedCopy(
  committed: Db,
  forkId: string,
  entityType: "aptitudes" | "feats",
  source: { id: string; name: string },
) {
  const [copy] = await Entities.create(committed, entityType, { rulesetId: forkId, name: source.name });
  await EntitySnapshots.create(committed, { rulesetId: forkId, sourceEntityId: source.id, forkedEntityId: copy.id });
  await Entities.delete(committed, { entityType, id: copy.id });
}

/** Runs `run` on a connection of the pool's, whose writes commit as they run. */
async function withCommittedDb<T>(run: (committed: Db) => Promise<T>) {
  const client = await pool.connect();
  try {
    return await run(createTestDbFromClient(client));
  } finally {
    client.release();
  }
}

// The test's own transaction has rolled back by now, and its rows with it: nothing of it still names these
afterAll(async () => {
  const ids = COMMITTED_RULESET_IDS.toReversed();
  await pool.query("delete from rules.ruleset_extensions where ruleset_id = any($1) or extension_id = any($1)", [ids]);
  await pool.query("delete from rules.entity_snapshots where ruleset_id = any($1)", [ids]);
  await pool.query("delete from rules.entities where ruleset_id = any($1)", [ids]);
  for (const id of ids) await pool.query("delete from rules.rulesets where id = $1", [id]);
  await pool.end();
});

// The view a write checks is the one its lock leaves, read again: a restore another transaction committed while the
// write waited shows its source again, whose name the write is then refused. The view read before the wait (the
// scope's, the cache's) still hid it.
test("a create waiting on a restore that commits is refused the name the restore shows again", async () => {
  const name = `Probe Restored ${uniqueId()}`;
  const { session, fork, source } = await withCommittedDb(async (committed) => {
    const parent = await createCommittedRuleset(committed, {});
    const [aptitude] = await Entities.create(committed, "aptitudes", { rulesetId: parent.id, name });
    const forked = await createCommittedFork(committed, parent.id);
    await deleteCommittedCopy(committed, forked.fork.id, "aptitudes", { id: aptitude.id, name });
    return { ...forked, source: aptitude };
  });

  await runWhileLocked(
    pool,
    async (blockerDb) => {
      await RulesetEntities.lockNames(blockerDb, { entityTypes: ["aptitudes"], rulesetId: fork.id });
      await EntitySnapshots.delete(blockerDb, { rulesetId: fork.id, sourceEntityId: source.id });
    },
    () => expectRefusedWith(EntitiesService.createEntity(session, fork.id, "aptitudes", { name }), 409),
    "COMMIT",
  );
});

// A spell's save planned from the view read before its lock would make its school's Spell Focus, which a restore
// another transaction committed shows again: planned again from the view read afresh, it makes none, and saves, as it
// would once the restore ran.
test("a spell create waiting on a restore of its school's Spell Focus saves without making it", async () => {
  const focus = "Spell Focus: Evocation";
  const { session, fork, source, wizard } = await withCommittedDb(async (committed) => {
    const parent = await createCommittedRuleset(committed, {});
    const [spells] = await Entities.create<Aptitude>(committed, "aptitudes", {
      rulesetId: parent.id,
      name: "Wizard Spells",
    });
    await Entities.create(committed, "aptitudes", { rulesetId: parent.id, name: "General" });
    const [feat] = await Entities.create(committed, "feats", { rulesetId: parent.id, name: focus });
    await Entities.create(committed, "feats", { rulesetId: parent.id, name: `Greater ${focus}` });
    const forked = await createCommittedFork(committed, parent.id);
    await deleteCommittedCopy(committed, forked.fork.id, "feats", { id: feat.id, name: focus });
    return { ...forked, source: feat, wizard: spells };
  });
  const body = {
    name: "Probe Bolt",
    links: { listedIn: [{ toId: wizard.id }] },
    fields: { [SPELL_SCHOOL]: "Evocation" },
  };

  const spell = await runWhileLocked(
    pool,
    async (blockerDb) => {
      await RulesetEntities.lockNames(blockerDb, { entityTypes: ["feats"], rulesetId: fork.id });
      await EntitySnapshots.delete(blockerDb, { rulesetId: fork.id, sourceEntityId: source.id });
    },
    () => EntitiesService.createEntity(session, fork.id, "spells", body),
    "COMMIT",
  );
  expect(spell.name).toBe("Probe Bolt");
  expect(await Entities.findOne(db, { entityType: "feats", rulesetId: fork.id, name: focus })).toBeUndefined();
  expect(await countFeats(fork.id, focus)).toBe(1);
});

// A subscribe and an unsubscribe check the subscription again on the ruleset their lock reads: one another committed
// while they waited is seen, as it would be one after the other.
test("a subscribe waiting on another of the same extension that commits is refused as already subscribed", async () => {
  const { session, host, extension } = await withCommittedDb(async (committed) => {
    const parent = await createCommittedRuleset(committed, {});
    const { session: owner, fork } = await createCommittedFork(committed, parent.id);
    const book = await createCommittedFork(committed, parent.id, {
      kind: "extension",
      status: "Published",
      private: false,
    });
    return { session: owner, host: fork, extension: book.fork };
  });

  await runWhileLocked(
    pool,
    async (blockerDb) => {
      await RulesetEntities.lockNames(blockerDb, { entityTypes: [RULESET_ENTITY_TYPES[0]], rulesetId: host.id });
      await RulesetExtensions.upsert(blockerDb, { rulesetId: host.id, extensionIds: [extension.id] });
    },
    () => expectRefusedWith(RulesetExtensionsService.subscribeExtension(session, host.id, [extension.id]), 409),
    "COMMIT",
  );
});

test("an unsubscribe waiting on another of the same extension that commits is refused as not subscribed", async () => {
  const { session, host, extension } = await withCommittedDb(async (committed) => {
    const parent = await createCommittedRuleset(committed, {});
    const { session: owner, fork } = await createCommittedFork(committed, parent.id);
    const book = await createCommittedFork(committed, parent.id, {
      kind: "extension",
      status: "Published",
      private: false,
    });
    await RulesetExtensions.upsert(committed, { rulesetId: fork.id, extensionIds: [book.fork.id] });
    return { session: owner, host: fork, extension: book.fork };
  });

  await runWhileLocked(
    pool,
    async (blockerDb) => {
      await RulesetEntities.lockNames(blockerDb, { entityTypes: [RULESET_ENTITY_TYPES[0]], rulesetId: host.id });
      await RulesetExtensions.archive(blockerDb, { rulesetId: host.id, extensionId: extension.id });
    },
    () => expectRefusedWith(RulesetExtensionsService.unsubscribeExtension(session, host.id, extension.id), 404),
    "COMMIT",
  );
});
