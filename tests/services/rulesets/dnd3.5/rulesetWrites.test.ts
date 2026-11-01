import { afterAll, expect, test } from "bun:test";

import type { Feat } from "@/engine/rulesets/dnd3.5/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Entities, Rulesets } from "@/server/repositories/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { BUSY_RULESET_MESSAGE } from "@/server/services/rulesets/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { bumpContentVersion, createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const pool = createTestPool();

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
    (blockerDb) => Rulesets.lockContent(blockerDb, { id: parentId }),
    () => EntitiesService.createEntity(session, fork.id, "aptitudes", { name: "Waited Aptitude" }),
  );
  expect(created.name).toBe("Waited Aptitude");
});

test("a write that waits on another past its lock wait is refused as busy, and writes nothing", async () => {
  const { session, fork, parentId } = await setup();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await Rulesets.lockContent(createTestDbFromClient(blocker), { id: parentId });
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
