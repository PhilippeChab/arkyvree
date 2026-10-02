import { expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { alignment, baseRules, gender, location, sizeType } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  ALIGNMENT_OPTIONS,
  DEFAULT_BASE_RULES,
  GENDER_OPTIONS,
  LOCATION_OPTIONS,
  SIZE_OPTIONS,
} from "@/shared/enums.ts";

// The option lists are written out so the client doesn't load the schema: they must stay the database's enums, in order
for (const [options, enumeration] of [
  [ALIGNMENT_OPTIONS, alignment],
  [GENDER_OPTIONS, gender],
  [LOCATION_OPTIONS, location],
  [SIZE_OPTIONS, sizeType],
] as const) {
  test(`${enumeration.enumName}'s options are the generated schema's and the migrated database's`, async () => {
    expect([...options]).toEqual([...enumeration.enumValues]);
    const live = await db.execute<{ label: string }>(sql`
      SELECT enumlabel AS label FROM pg_enum
      WHERE enumtypid = ${enumeration.enumName}::regtype ORDER BY enumsortorder
    `);
    expect(live.rows.map((row) => row.label)).toEqual([...options]);
  });
}

test("the default base rules are one of the database's", () => {
  expect(baseRules.enumValues).toContain(DEFAULT_BASE_RULES);
});
