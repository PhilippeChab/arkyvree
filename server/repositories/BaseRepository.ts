import { and, asc, type Column, desc, eq, getTableColumns, isNull, not, sql, type SQL, type Table } from "drizzle-orm";

import type { Db } from "@/server/database/index.ts";

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

  protected orderBy(column: Column | SQL, direction: "asc" | "desc" = "asc"): SQL {
    return direction === "asc" ? asc(column) : desc(column);
  }

  protected visibility(visibility: Visibility): boolean | SQL {
    switch (visibility) {
      case Visibility.All:
        return false;
      case Visibility.UnarchivedOnly:
        // @ts-expect-error All tables have a deletedAt column
        return isNull(this.table.deletedAt);
      case Visibility.ArchivedOnly:
        // @ts-expect-error All tables have a deletedAt column
        return not(isNull(this.table.deletedAt));
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
    const columns = getTableColumns(this.table);
    if (!columns.id) throw new Error("Row locking requires an id column");
    const rows = await db
      .select({ locked: sql<number>`1` })
      .from(sql`${this.table}`)
      .where(and(eq(columns.id, where.id), columns.deletedAt ? isNull(columns.deletedAt) : undefined))
      .for(mode, skipLocked ? { skipLocked: true } : {});
    return rows.length > 0;
  }
}

export default BaseRepository;
