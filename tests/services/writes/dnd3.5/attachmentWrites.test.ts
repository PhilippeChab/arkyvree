import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { ConflictError } from "@/server/errors/index.ts";
import { Characters, Locks } from "@/server/repositories/index.ts";
import { AttachmentsService } from "@/server/services/attachments/index.ts";
import { runWhileCommitting } from "@/tests/support/database.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

/** The characters the probes committed, which another connection sees: deleted once every test rolled back. */
const committed: string[] = [];

const pool = createTestPool();

/** A PNG's first bytes, which name its type, then 64 bytes in all. */
function png() {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new File([bytes], "portrait.png", { type: "image/png" });
}

/**
 * A player character of the seed user's, on the seeded ruleset, committed through the probes' pool: one another
 * connection sees, so it can hold and archive its row, as no seeded character may be. Deleted after the file's tests.
 */
async function commitCharacter() {
  const client = await pool.connect();
  try {
    const [character] = await Characters.create(createTestDbFromClient(client), {
      kind: PLAYER_CHARACTER_KIND,
      name: `Locked Character ${uniqueId()}`,
      rulesetId: (await getSeedCtx()).rulesetId,
      userId: SEED_USER_ID,
    });
    committed.push(character.id);
    return character;
  } finally {
    client.release();
  }
}

afterAll(async () => {
  const client = await pool.connect();
  try {
    for (const id of committed) await Characters.delete(createTestDbFromClient(client), { id });
  } finally {
    client.release();
  }
  await pool.end();
});

test("a portrait's write waits for its character's write, and is refused by its policy on the state it left", async () => {
  const character = await commitCharacter();
  // The character's archive holds its row: the portrait's write, which its owner could make, waits at its lock, then
  // asks the policy on the archived row, a refusal on its state
  const write = runWhileCommitting(
    pool,
    (blockerDb) => Locks.lockCharacters(blockerDb, { ids: [character.id] }, "no key update"),
    () => AttachmentsService.setAttachment(makeSession(), "Character", character.id, "portrait", png()),
    ({ blockerDb }) => Characters.archive(blockerDb, { id: character.id }),
  );
  expect(write).rejects.toEqual(new ConflictError("This character is archived"));
});
