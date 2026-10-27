import { expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { BASE_RULES_OPTIONS, CONTRIBUTOR_STATUSES } from "@/shared/enums.ts";

// The base rules are written out so the client doesn't load the schema: they must stay the registered modules'
test("the base rules are the modules the migrated database registers", async () => {
  const live = await db.execute<{ base_rules: string }>(sql`SELECT base_rules FROM rules.modules ORDER BY base_rules`);
  expect(live.rows.map((row) => row.base_rules)).toEqual([...BASE_RULES_OPTIONS].sort());
});

// A contributor's status is a CHECK constraint's list, not an enum: a ruleset's and a character's allow the same
test("the contributors' statuses are what their tables' CHECK constraints allow", async () => {
  const live = await db.execute<{ definition: string }>(
    sql`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname IN ('contributors_status_check', 'character_contributors_status_check')`,
  );
  const allowed = live.rows.map((row) => [...row.definition.matchAll(/'(\w+)'/g)].map(([, status]) => status));
  expect(allowed).toEqual([[...CONTRIBUTOR_STATUSES], [...CONTRIBUTOR_STATUSES]]);
});
