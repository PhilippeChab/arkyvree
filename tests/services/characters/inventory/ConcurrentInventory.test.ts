import { afterAll, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { createTestDbFromClient, createTestPool } from "@/server/database/test.ts";
import { CharacterInventory, Characters } from "@/server/repositories/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { runWhileLocked } from "@/tests/support/database.ts";
import { getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

const pool = createTestPool();
afterAll(() => pool.end());

test("checks an entry's place once the write before it is saved: an off hand another takes is refused", async () => {
  const ctx = await getSeedCtx();
  // Committed, for the other write to see: deleted, with its entries, as the test ends
  const client = await pool.connect();
  const [character] = await Characters.create(createTestDbFromClient(client), {
    age: 25,
    alignment: "Neutral Good",
    gender: "Male",
    height: "180",
    name: `Concurrent Character ${uniqueId()}`,
    raceId: ctx.raceMap.pc.Human!,
    rulesetId: ctx.rulesetId,
    userId: SEED_USER_ID,
    weight: "75",
    xp: 0,
  });
  client.release();
  const shield = (name: string) => ({ itemId: ctx.itemMap[name]!, location: "Off Hand" as const, weaponSets: [0] });
  try {
    // The other write holds the character as it puts a shield in its off hand, then commits it
    const raced = runWhileLocked(
      pool,
      (blockerDb) =>
        CharacterInventory.create(blockerDb, {
          characterId: character!.id,
          equipped: true,
          quantity: 1,
          ...shield("Heavy Steel Shield"),
        }),
      () => {
        const { itemId, location, weaponSets } = shield("Light Steel Shield");
        const session = makeSession(SEED_USER_ID);
        return CharacterInventoryService.addItem(
          session,
          character!.id,
          itemId,
          1,
          true,
          location,
          null,
          null,
          weaponSets,
          true,
        );
      },
      "COMMIT",
    );
    expect(raced).rejects.toThrow(/Heavy Steel Shield/);
    await raced.catch(() => undefined);
  } finally {
    await pool.query(`delete from "character".characters where id = $1`, [character!.id]);
  }
});
