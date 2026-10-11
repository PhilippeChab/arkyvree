import { and, asc, type Column, desc, eq, getTableColumns, isNull, not, sql, type SQL, type Table } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";

export enum Visibility {
  All,
  ArchivedOnly,
  UnarchivedOnly,
}

export const visibilityMap = {
  active: Visibility.UnarchivedOnly,
  archived: Visibility.ArchivedOnly,
  all: Visibility.All,
} as const;

/**
 * A repository's core: its table, and what every query builds on. The rest is in the concerns a repository includes
 * (`concerns/`): pagination, search, ruleset scoping, copy-on-write ids, stale-edit guards.
 */
abstract class BaseRepository<T extends Table> {
  constructor(protected readonly table: T) {}

  /**
   * A WHERE built from a `where` union: `keys`, the conditions that pick its rows, one per branch, and `rest`, those
   * that narrow them (`isNull(deletedAt)`, `rulesetId`, `status`). A `where` that matches no branch would pick every
   * row (a write would reach them all, a read return any), so it throws instead.
   */
  protected branchWhere(keys: (SQL | boolean)[], rest: (SQL | boolean)[] = []) {
    if (!keys.some(Boolean)) throw new Error(`${this.constructor.name}: a where that matches none of its branches`);
    return this.where([...keys, ...rest]);
  }

  /**
   * The table's column `name`, one every table a concern reads has (`deletedAt`, `updatedAt`, `id`, `rulesetId`,
   * `campaignId`), which the table's generic type can't promise: a table without it throws.
   */
  protected column(name: string): Column {
    const column: Column | undefined = getTableColumns(this.table)[name];
    if (!column) throw new Error(`${this.constructor.name}: its table has no ${name} column`);
    return column;
  }

  protected orderBy(column: Column | SQL, direction: "asc" | "desc" = "asc"): SQL {
    return direction === "asc" ? asc(column) : desc(column);
  }

  protected visibility(visibility: Visibility): boolean | SQL {
    switch (visibility) {
      case Visibility.All:
        return false;
      case Visibility.UnarchivedOnly:
        return isNull(this.column("deletedAt"));
      case Visibility.ArchivedOnly:
        return not(isNull(this.column("deletedAt")));
      default:
        return false;
    }
  }

  protected where(statements: (SQL | boolean)[]) {
    return and(...(statements.filter(Boolean) as SQL[]));
  }

  /** Call inside a transaction to lock a stored row before changing its children.
   * IDs are already resolved by the caller. Never memoize a locking read.
   * `skipLocked`: a row another transaction holds counts as not found instead of being waited for.
   */
  async lock(db: Db, where: { id: string }, mode: "update" | "share" = "update", skipLocked = false): Promise<boolean> {
    // A table without `deletedAt` keeps no archived rows to skip
    const { deletedAt } = getTableColumns(this.table);
    const rows = await db
      .select({ locked: sql<number>`1` })
      .from(sql`${this.table}`)
      .where(and(eq(this.column("id"), where.id), deletedAt ? isNull(deletedAt) : undefined))
      .for(mode, skipLocked ? { skipLocked: true } : {});
    return rows.length > 0;
  }
}

export default BaseRepository;
