/** A row of a grouped table: one of its rows, or the header of the group a family two of them share makes. */
type GroupedTableRow<R> =
  | { group: string | null; row: R; type: "row" }
  | { count: number; prefix: string; type: "group" };

/**
 * A table's rows as it shows them, with a header row before each family (their rules': 3.5's skills' "Knowledge") that
 * two or more of them share.
 */
export function groupRows<R extends { family: string | null }>(rows: readonly R[]): GroupedTableRow<R>[] {
  const prefixCounts = new Map<string, number>();
  for (const row of rows) {
    const prefix = row.family;
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const grouped: GroupedTableRow<R>[] = [];
  let lastPrefix: string | null = null;
  for (const row of rows) {
    const prefix = row.family;
    const count = prefix === null ? 0 : (prefixCounts.get(prefix) ?? 0);
    const group = count >= 2 ? prefix : null;
    if (group !== null && group !== lastPrefix) {
      grouped.push({ type: "group", prefix: group, count });
      lastPrefix = group;
    }
    grouped.push({ type: "row", row, group });
  }
  return grouped;
}
