/** The migrations `migrate.ts` applies, each run on rows written as they stood before it, in the test's transaction. */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { findSeededCharacter, getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A migration's statements, as drizzle splits them. */
function statementsOf(file: string) {
  return readFileSync(`drizzle/${file}`, "utf8").split("--> statement-breakpoint");
}

describe("0079_weapon-sets", () => {
  test("turns an entry's weapon set into a list of it, and an entry without one into none", async () => {
    // The inventory as it stood before: one set at most
    await db.execute(sql`ALTER TABLE character.inventory DROP COLUMN weapon_sets`);
    await db.execute(sql`ALTER TABLE character.inventory ADD COLUMN weapon_set smallint`);
    const { id: characterId } = await findSeededCharacter("Bjorn Ironhand");
    const { itemMap } = await getSeedCtx();
    await db.execute(sql`DELETE FROM character.inventory WHERE character_id = ${characterId}`);
    await db.execute(sql`
      INSERT INTO character.inventory (character_id, item_id, quantity, equipped, location, weapon_set) VALUES
        (${characterId}, ${itemMap["Longsword"]}, 1, true, 'Main Hand', 0),
        (${characterId}, ${itemMap["Heavy Steel Shield"]}, 1, true, 'Off Hand', 1),
        (${characterId}, ${itemMap["Bedroll"]}, 1, false, null, null)
    `);

    for (const statement of statementsOf("0079_weapon-sets.sql")) await db.execute(sql.raw(statement));

    const { rows } = await db.execute<{ location: string | null; weapon_sets: number[] }>(sql`
      SELECT location, weapon_sets FROM character.inventory WHERE character_id = ${characterId} ORDER BY location
    `);
    expect(rows).toEqual([
      { location: "Main Hand", weapon_sets: [0] },
      { location: "Off Hand", weapon_sets: [1] },
      { location: null, weapon_sets: [] },
    ]);
    // A new entry is in no set
    await db.execute(sql`
      INSERT INTO character.inventory (character_id, item_id, quantity) VALUES (${characterId}, ${itemMap["Bedroll"]}, 1)
    `);
    const { rows: added } = await db.execute<{ weapon_sets: number[] }>(sql`
      SELECT weapon_sets FROM character.inventory WHERE character_id = ${characterId} AND location IS NULL
    `);
    expect(added).toEqual([{ weapon_sets: [] }, { weapon_sets: [] }]);
  });
});

describe("0081_export-status", () => {
  test("keeps an export stored before as its file, ready, and lets a pending one wait without one", async () => {
    // The exports as they stood before: each a file
    await db.execute(sql`ALTER TABLE account.exports DROP COLUMN status`);
    await db.execute(sql`DROP TYPE export_status`);
    await db.execute(sql`ALTER TABLE account.exports ALTER COLUMN data SET NOT NULL`);
    const { user } = await createTestUser();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.execute(sql`
      INSERT INTO account.exports (user_id, type, mime_type, file_name, data, expires_at)
      VALUES (${user.id}, 'pdf', 'application/pdf', 'stored-sheet.pdf', 'fake pdf content'::bytea, ${expiresAt})
    `);

    for (const statement of statementsOf("0081_export-status.sql")) await db.execute(sql.raw(statement));

    await db.execute(sql`
      INSERT INTO account.exports (user_id, type, mime_type, file_name, expires_at, status)
      VALUES (${user.id}, 'pdf', 'application/pdf', 'queued-sheet.pdf', ${expiresAt}, 'pending')
    `);
    const { rows } = await db.execute<{ file_name: string; has_file: boolean; status: string }>(sql`
      SELECT file_name, data IS NOT NULL AS has_file, status FROM account.exports
      WHERE user_id = ${user.id} ORDER BY file_name
    `);
    expect(rows).toEqual([
      { file_name: "queued-sheet.pdf", has_file: false, status: "pending" },
      { file_name: "stored-sheet.pdf", has_file: true, status: "ready" },
    ]);
  });
});
