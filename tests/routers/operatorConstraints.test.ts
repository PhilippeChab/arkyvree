import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { modifiersInCustomization, requirementsInCustomization } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { CHAINING_OPERATORS, MODIFIER_OPERATORS, REQUIREMENT_OPERATORS } from "@/shared/customization/operators.ts";

// Inspect PostgreSQL's normalized text constants only in this drift test.
// Application code never parses generated schema SQL or queries the catalog.
function operatorValues(definition: string): string[] {
  return [...definition.matchAll(/'((?:[^']|'')*)'::text/g)]
    .map(match => match[1].replaceAll("''", "'"));
}

const dialect = new PgDialect();
for (const [table, constraintName, operators] of [
  [modifiersInCustomization, "modifiers_operator_check", MODIFIER_OPERATORS],
  [requirementsInCustomization, "requirements_operator_check", REQUIREMENT_OPERATORS],
  [requirementsInCustomization, "requirements_check", CHAINING_OPERATORS],
] as const) {
  test(`${constraintName} matches application operators and the generated schema`, async () => {
    const config = getTableConfig(table);
    const constraint = config.checks.find(check => check.name === constraintName)!;
    const expression = dialect.sqlToQuery(constraint.value);
    expect(operatorValues(expression.sql)).toEqual([...operators]);
    const live = await db.execute<{ definition: string }>(sql`
      SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conname = ${constraintName} AND conrelid = ${`${config.schema}.${config.name}`}::regclass
    `);
    expect(live.rows).toHaveLength(1);
    expect(operatorValues(live.rows[0].definition)).toEqual([...operators]);
  });
}
