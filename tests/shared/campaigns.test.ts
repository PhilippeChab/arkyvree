import { expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { CHARACTER_VISIBILITY_OPTIONS } from "@/shared/campaigns.ts";

// The options are written out so the client doesn't load the schema: they must stay the column's check, in order
test("a campaign character's visibilities are the migrated database's check", async () => {
  const check = await db.execute<{ definition: string }>(sql`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conname = 'player_characters_visibility_check'
  `);
  const [definition] = check.rows.map((row) => row.definition);
  expect([...(definition ?? "").matchAll(/'([^']+)'::text/g)].map((match) => match[1])).toEqual([
    ...CHARACTER_VISIBILITY_OPTIONS,
  ]);
});
