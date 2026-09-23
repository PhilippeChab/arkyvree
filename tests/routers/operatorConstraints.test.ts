import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

const dialect = new PgDialect();
for (const [table, constraintName] of [
  [modifiersInCustomization, "modifiers_operator_check"],
  [requirementsInCustomization, "requirements_operator_check"],
  [requirementsInCustomization, "requirements_check"],
] as const) {
  test(`${constraintName} matches the migrated database after sharing operator definitions`, async () => {
    const config = getTableConfig(table);
    const constraint = config.checks.find(check => check.name === constraintName)!;
    const expression = dialect.sqlToQuery(constraint.value);
    expect(expression.params).toEqual([]);
    // PostgreSQL normalizes both expressions, avoiding a brittle comparison
    // of whitespace or redundant parentheses in handwritten schema SQL.
    const temporaryTable = `qa_${constraintName}`;
    await db.execute(sql.raw(`CREATE TEMP TABLE ${temporaryTable} (
      operator text, chaining_operator text, value text, value_type text, target text,
      CONSTRAINT ${constraintName} CHECK (${expression.sql})
    ) ON COMMIT DROP`));
    const live = await db.execute<{ definition: string }>(sql`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname = ${constraintName} AND conrelid = ${`${config.schema}.${config.name}`}::regclass
    `);
    const generated = await db.execute<{ definition: string }>(sql`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname = ${constraintName} AND conrelid = ${temporaryTable}::regclass
    `);
    expect(live.rows).toHaveLength(1);
    expect(generated.rows).toEqual(live.rows);
  });
}
