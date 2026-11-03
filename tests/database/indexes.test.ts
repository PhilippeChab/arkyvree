/**
 * `drizzle/schema.ts` declares the indexes the migrations create, and no other: drizzle-kit writes the next migration
 * from what the schema declares against its last snapshot, so an index only one of them holds is one that migration
 * would create or drop. The SQL drizzle-kit writes for the whole schema builds each of its schemas again, under
 * another name, in the test's transaction; the database then reads back each index of both, primary keys and unique
 * constraints too.
 */

import { expect, test } from "bun:test";

import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { sql } from "drizzle-orm";

import * as schema from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

/** The prefix of the schemas the declared SQL builds. */
const DECLARED = "declared_";

/**
 * The SQL drizzle-kit writes for the whole schema, each of its schemas renamed, and those schemas' own names. The
 * enums of `public`, which the tables name unqualified, are the migrated database's.
 */
async function declaredStatements() {
  const statements = (await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))).filter(
    (statement) => !statement.startsWith('CREATE TYPE "public".'),
  );
  const schemas = statements.flatMap((statement) => statement.match(/^CREATE SCHEMA "(\w+)"/)?.[1] ?? []);
  const named = new RegExp(`"(${schemas.join("|")})"(?=[.;])`, "g");
  return { schemas, statements: statements.map((statement) => statement.replaceAll(named, `"${DECLARED}$1"`)) };
}

/**
 * Each index of those schemas, under their prefix, as a line: its schema's own name, its constraint's kind (`p`, `u`,
 * or `i` for an index alone) and its definition, which names its table without its schema.
 */
async function indexesIn(schemas: string[], prefix: string) {
  const { rows } = await db.execute<{ line: string }>(sql`
    SELECT concat_ws(' ', substr(n.nspname, ${prefix.length + 1}), coalesce(c.contype::text, 'i'),
      regexp_replace(replace(pg_get_indexdef(ix.indexrelid), ${prefix}, ''), ' ON \\S+\\.', ' ON ')) AS line
    FROM pg_index ix
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = ix.indexrelid AND c.conrelid = ix.indrelid AND c.contype IN ('p', 'u', 'x')
    WHERE n.nspname = ANY(${sql.param(schemas.map((name) => `${prefix}${name}`))}::text[])
    ORDER BY line`);
  return rows.map((row) => row.line);
}

test("schema.ts declares every index the migrations create, and no other", async () => {
  const { schemas, statements } = await declaredStatements();
  await db.execute(sql.raw(statements.join("\n")));

  const declared = await indexesIn(schemas, DECLARED);
  expect(declared.length).toBeGreaterThan(0);
  expect(declared).toEqual(await indexesIn(schemas, ""));
});
