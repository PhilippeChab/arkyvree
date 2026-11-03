import { type SQL, sql } from "drizzle-orm";
import { getTableConfig, type PgColumn, type PgTable } from "drizzle-orm/pg-core";

/**
 * A column of the query's own table as a subquery reads it, named in full (`"rules"."entities"."id"`): Drizzle names a
 * column bare in a selected expression, which a subquery's table of the same column name (an `id`) would then answer.
 */
export function toQualified(column: PgColumn): SQL {
  const { name, schema } = getTableConfig(column.table as PgTable);
  return sql.raw(`"${schema ?? "public"}"."${name}"."${column.name}"`);
}
