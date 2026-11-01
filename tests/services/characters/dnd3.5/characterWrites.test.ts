import { afterAll, expect, test } from "bun:test";

import type { Item } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { CharacterInventory, Characters, Entities, Rulesets } from "@/server/repositories/index.ts";
import { BUSY_CHARACTER_MESSAGE } from "@/server/services/characters/characterWrites.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { measure, runWhileLocked } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { bumpContentVersion, invalidateSeededRuleset, readView } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

/** What a character's write waits at while another holds the character's row: its own lock of it. */
const CHARACTER_LOCK = /from "character"\."characters".*for no key update/is;

const pool = createTestPool();

/** A write of a character that reads its ruleset's view: an item of its ruleset, made for it, added to its inventory. */
async function addItem(characterId: string, rulesetId: string, session: Session = makeSession()) {
  const [item] = await Entities.create<Item>(db, "items", { name: `Probe Item ${uniqueId()}`, rulesetId });
  // Written past the ruleset's helper, which would bump its version and hold its row for the test: its view dropped,
  // now and once the rollback undoes the item
  invalidateSeededRuleset(rulesetId);
  return () => CharacterInventoryService.addItem(session, characterId, item.id, 1, null, null, null, []);
}

afterAll(() => pool.end());

test("a character's write waits for a write to its ruleset, which it reads shared, then writes", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  const write = await addItem(character.id, rulesetId);
  // The ruleset's write holds its lock (its content version bumped, in a transaction another connection holds)
  const entry = await runWhileLocked(pool, (blockerDb) => Rulesets.lockContent(blockerDb, { id: rulesetId }), write);
  expect(entry.characterId).toBe(character.id);
});

test("a character's write waits at its own lock of the character's row, one of its own columns or one of its ruleset", async () => {
  // Seeded characters: ones another connection sees, so it can hold their rows. One each: a write's lock lasts the
  // test's transaction
  const named = await findSeededCharacter("Fenn Ashwalker");
  const equipped = await findSeededCharacter("Kael Stormborn");
  const writes: Array<[string, () => Promise<unknown>]> = [
    [named.id, () => CharactersService.updateCharacter(makeSession(), named.id, { name: `Waited ${uniqueId()}` })],
    [equipped.id, await addItem(equipped.id, equipped.rulesetId)],
  ];
  for (const [characterId, write] of writes) {
    let waiting = "";
    await runWhileLocked(
      pool,
      (blockerDb) => Characters.lock(blockerDb, { id: characterId }, "no key update"),
      write,
      (held) => void (waiting = held.waiting),
    );
    expect(waiting).toMatch(CHARACTER_LOCK);
  }
}, 15_000);

test("a bonded creature's write locks its master first, so a write of the master that writes it never waits on it", async () => {
  const master = await findSeededCharacter("Elara Starweaver");
  const [creature] = await Characters.findMany(db, { parentCharacterId: master.id });
  let masterWrite: unknown;
  await runWhileLocked(
    pool,
    // The master's write (a level save, an archive) holds the master, then writes its creature
    (blockerDb) => Characters.lock(blockerDb, { id: master.id }, "no key update"),
    () => CharactersService.updateCharacter(makeSession(), creature.id, { notes: `Waited ${uniqueId()}` }),
    async ({ blockerDb }) => {
      masterWrite = await Characters.update(blockerDb, { notes: creature.notes }, { id: creature.id });
    },
  );
  expect(masterWrite).toHaveLength(1);
}, 15_000);

test("characters of one ruleset write at once: a write holds its ruleset shared, no other character's waits on it", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  const blocker = await pool.connect();
  try {
    await blocker.query("BEGIN");
    // Another character's write holds the ruleset as every character's write does
    await Rulesets.lockVersions(createTestDbFromClient(blocker), { ids: [rulesetId] });
    // A wait would end at the write's lock wait, refused as busy
    expect((await (await addItem(character.id, rulesetId))()).characterId).toBe(character.id);
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
    const write = await addItem(character.id, rulesetId);
    await Rulesets.lockContent(createTestDbFromClient(blocker), { id: rulesetId });
    expect(write()).rejects.toMatchObject({ code: 409, message: BUSY_CHARACTER_MESSAGE });
  } finally {
    await blocker.query("ROLLBACK");
    blocker.release();
  }
  expect(await CharacterInventory.findMany(db, { characterId: character.id })).toEqual([]);
}, 15_000);

test("a character's write reads its ruleset's rows a write committed after its view was cached", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { rulesetId } = await getSeedCtx();
  await readView(rulesetId);
  // Another process's write of the ruleset, committed: this process's cache never hears of it but by its version
  const [item] = await Entities.create<Item>(db, "items", { name: `Fresh Item ${uniqueId()}`, rulesetId });
  await bumpContentVersion(rulesetId);
  const entry = await CharacterInventoryService.addItem(makeSession(), character.id, item.id, 1, null, null, null, []);
  expect(entry.characterId).toBe(character.id);
  // What the write cached of the item goes once the rollback undoes it
  invalidateSeededRuleset(rulesetId);
});

test("a stranger's write to a character is refused before it reads the ruleset's view", async () => {
  const character = await createTestCharacter(SEED_USER_ID);
  const { session: stranger } = await createTestUser();
  const { rulesetId } = await getSeedCtx();
  // A write that reads the ruleset's view, a stranger's
  const write = await addItem(character.id, rulesetId, stranger);
  const refuse = async () => (await measure(() => expectRefusedWith(write(), 404))).timing.queryCount;

  RulesetViews.invalidate(rulesetId);
  const cold = await refuse();
  await readView(rulesetId);
  // Its locks and its access alone, under them: the same queries whether the cache holds the view it never reads or not
  expect(await refuse()).toBe(cold);
});
