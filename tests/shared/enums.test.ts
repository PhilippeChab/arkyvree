import { expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { BASE_RULES_OPTIONS } from "@/shared/enums.ts";

// The base rules are written out so the client doesn't load the schema: they must stay the registered modules'
test("the base rules are the modules the migrated database registers", async () => {
  const live = await db.execute<{ base_rules: string }>(sql`SELECT base_rules FROM rules.modules ORDER BY base_rules`);
  expect(live.rows.map((row) => row.base_rules)).toEqual([...BASE_RULES_OPTIONS].sort());
});
