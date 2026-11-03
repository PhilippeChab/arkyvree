import { afterAll, expect, test } from "bun:test";

import type { Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Entities, Locks, Rulesets } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { BUSY_RULESET_MESSAGE } from "@/server/services/writes/index.ts";
import { measure, runWhileLocked } from "@/tests/support/database.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { bumpContentVersion, createSeededTestRuleset, readView } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

const pool = createTestPool();

/**
 * What a ruleset's write waits at while another holds the ruleset's row: its own lock of it, its content version bumped
 * (`Locks.lockRulesetContent`), read by its start.
 */
const RULESET_CONTENT_LOCK = /^update "rules"\."rulesets" set "content_version"/;

/** A fork of the seeded rules, its owner's session, and the seeded rules' id, its parent's. */
async function setup() {
  const session = makeSession();
  const fork = await createSeededTestRuleset(session.userId);
  return { session, fork, parentId: (await getSeedCtx()).rulesetId };
}

afterAll(() => pool.end());

test("a write to a fork waits for a write to its parent, which it reads shared, then writes", async () => {
  const { session, fork, parentId } = await setup();
  // The parent's write holds its lock (its content version bumped, in a transaction another connection holds)
  const created = await runWhileLocked(
    pool,
    (blockerDb) => Locks.lockRulesetContent(blockerDb, parentId),
    () => EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Waited Aptitude" }),
  );
  expect(created.name).toBe("Waited Aptitude");
});

test("a write to a ruleset waits for another write to it at its own lock of the ruleset", async () => {
  const { session, parentId } = await setup();
  // A system ruleset no session writes: its lock is taken, and waited for, before the write is refused
  let waiting = "";
  const refused = runWhileLocked(
    pool,
    (blockerDb) => Locks.lockRulesetContent(blockerDb, parentId),
    () => EntitiesService.createEntity(session, parentId, "aptitudes", { name: "Refused Aptitude" }),
    (held) => void (waiting = held.waiting),
  );
  expect(refused).rejects.toEqual(new ForbiddenError("Cannot edit a base ruleset"));
  expect(waiting).toMatch(RULESET_CONTENT_LOCK);
});

test("two forks of one parent write at once: a write holds its parent shared, no other fork's waits on it", async () => {
  const { session, fork, parentId } = await setup();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    // Another fork's write holds the parent as every fork's write does
    await Locks.lockRulesets(createTestDbFromClient(blocker), { ids: [parentId] }, "share");
    // A wait would end at the write's lock wait, refused as busy
    const created = await EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Concurrent Aptitude" });
    expect(created.name).toBe("Concurrent Aptitude");
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
}, 15_000);

test("a stranger's write to a private ruleset is refused before it reads the ruleset's view", async () => {
  const { fork } = await setup();
  await Rulesets.update(db, { private: true }, { id: fork.id });
  const { session: stranger } = await createTestUser();
  const refuse = async () =>
    (
      await measure(async () => {
        expect(
          EntitiesService.createEntity(stranger, fork.id, "aptitudes", { name: "Stranger Aptitude" }),
        ).rejects.toEqual(new NotFoundError("Ruleset not found"));
      })
    ).timing.queryCount;

  RulesetViews.invalidate(fork.id);
  const cold = await refuse();
  await readView(fork.id);
  // Its lock and its access alone, under it: the same queries whether the cache holds the view it never reads or not
  expect(await refuse()).toBe(cold);
});

test("a write that waits on another past its lock wait is refused as busy, and writes nothing", async () => {
  const { session, fork, parentId } = await setup();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await Locks.lockRulesetContent(createTestDbFromClient(blocker), parentId);
    expect(
      EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Busy Aptitude" }),
    ).rejects.toMatchObject({ code: 409, message: BUSY_RULESET_MESSAGE });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  expect(
    await Entities.findOne(db, { entityType: "aptitudes", name: "Busy Aptitude", rulesetId: fork.id }),
  ).toBeUndefined();
}, 15000);

test("a write reads the rows another write committed after its view was cached", async () => {
  const { session, fork } = await setup();
  // The view is cached; then another write makes a feat, its lock bumping the fork's content version
  await withRulesetScope(db, fork.id, async () => undefined);
  const [feat] = await Entities.create<Feat>(db, "feats", { name: "Fresh Feat", rulesetId: fork.id });
  await bumpContentVersion(fork.id);

  // The modifier's write finds the feat in its view, read fresh under its lock
  const modifier = await ModifiersService.createModifier(session, fork.id, "feats", feat.id, STRENGTH_BONUS);
  expect(modifier.resolvedEntityId).toBe(feat.id);
});

test("a write keeps what the cache holds at the versions its locks read: its parent's rows, unchanged", async () => {
  const { session, fork, parentId } = await setup();
  const parentRows = await RulesetViews.getRawData(parentId);
  await EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Cached Aptitude" });
  expect(await RulesetViews.getRawData(parentId)).toBe(parentRows);
});
