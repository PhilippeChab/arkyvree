import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { Characters, Rulesets } from "@/server/repositories/index.ts";
import { BUSY_CHARACTER_MESSAGE } from "@/server/services/characters/characterWrites.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { measure, runWhileLocked } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { readView } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

const pool = createTestPool();

afterAll(() => pool.end());

test("a character's write waits for a write to its ruleset, which it reads shared, then writes", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  const name = `Waited ${uniqueId()}`;
  // The ruleset's write holds its lock (its content version bumped, in a transaction another connection holds)
  const updated = await runWhileLocked(
    pool,
    (blockerDb) => Rulesets.lockContent(blockerDb, { id: rulesetId }),
    () => CharactersService.updateCharacter(makeSession(), character.id, { name }),
  );
  expect(updated.name).toBe(name);
});

test("a character's write waits for another write to the character", async () => {
  // A seeded character: one another connection sees, so it can hold its row
  const seeded = await findSeededCharacter("Fenn Ashwalker");
  const name = `Waited ${uniqueId()}`;
  const updated = await runWhileLocked(
    pool,
    (blockerDb) => Characters.lock(blockerDb, { id: seeded.id }, "no key update"),
    () => CharactersService.updateCharacter(makeSession(), seeded.id, { name }),
  );
  expect(updated.name).toBe(name);
});

test("characters of one ruleset write at once: a write holds its ruleset shared, no other character's waits on it", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    // Another character's write holds the ruleset as every character's write does
    await Rulesets.lockVersions(createTestDbFromClient(blocker), { ids: [rulesetId] });
    // A wait would end at the write's lock wait, refused as busy
    const name = `Concurrent ${uniqueId()}`;
    expect((await CharactersService.updateCharacter(makeSession(), character.id, { name })).name).toBe(name);
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
}, 15_000);

test("a character's write that waits on its ruleset's write past its lock wait is refused as busy, and writes nothing", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    await Rulesets.lockContent(createTestDbFromClient(blocker), { id: rulesetId });
    expect(
      CharactersService.updateCharacter(makeSession(), character.id, { name: `Refused ${uniqueId()}` }),
    ).rejects.toMatchObject({ code: 409, message: BUSY_CHARACTER_MESSAGE });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  expect((await Characters.findOne(db, { id: character.id }))?.name).toBe(character.name);
}, 15_000);

test("a stranger's write to a character is refused before it reads the ruleset's view", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { session: stranger } = await createTestUser();
  const { rulesetId } = await getSeedCtx();
  const refuse = async () =>
    (
      await measure(() =>
        expectRefusedWith(CharactersService.updateCharacter(stranger, character.id, { name: "Stranger" }), 404),
      )
    ).timing.queryCount;

  RulesetViews.invalidate(rulesetId);
  const cold = await refuse();
  await readView(rulesetId);
  // Its locks and its access alone, under them: the same queries whether the cache holds the view it never reads or not
  expect(await refuse()).toBe(cold);
});
