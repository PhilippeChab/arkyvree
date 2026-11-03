import type { RulesDescription } from "@/client/src/lib/queries.ts";

/** A list's column of an entity's own value, as its rules describe it. */
type ListColumn = NonNullable<RulesDescription["lists"][string]>["columns"][number];

/** A list's column's id, in its table and its rows: where its value is stored, its own field or its links' role. */
export function listColumnId(column: ListColumn): string {
  return column.field ?? column.role ?? "";
}
