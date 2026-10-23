import { and, asc, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entityLinksInRules } from "@/drizzle/schema.ts";
import { Engine, type LinkPart } from "@/engine/index.ts";

/** A link's column for each of its parts. */
const LINK_PARTS: Record<LinkPart, PgColumn> = {
  amount: entityLinksInRules.amount,
  free: entityLinksInRules.free,
  from: entityLinksInRules.fromId,
  id: entityLinksInRules.id,
  tier: entityLinksInRules.tier,
  to: entityLinksInRules.toId,
  via: entityLinksInRules.viaId,
};

/** A join's row, as a write gives it: its columns by their names. */
export type JoinValues = Record<string, unknown>;

/**
 * A join's rows (a feat's pools, a class level's grants), as the generic tables store them, links of a role from a kind
 * to another (`rules.entity_links`), and its module declares them (`Engine.storage().join(name)`): read as one row each,
 * every part under its column's name (`columns`), in each from-entity's order (`order`), and written from one
 * (`insert`, after the from-entity's last of the role).
 */
export default class StoredJoins {
  /** The join's columns, each a link's part by its name, and its timestamps (a link is never archived). */
  static columns(name: string): Record<string, PgColumn | SQL> {
    const join = Engine.storage().join(name);
    return {
      ...Object.fromEntries(Object.entries(join.columns).map(([column, part]) => [column, LINK_PARTS[part]])),
      createdAt: entityLinksInRules.createdAt,
      updatedAt: entityLinksInRules.updatedAt,
      deletedAt: sql<string | null>`NULL::timestamptz`,
    };
  }

  /** The column of a link's part: its from-entity's, its to-entity's. */
  static part(part: LinkPart): PgColumn {
    return LINK_PARTS[part];
  }

  /**
   * Writes a join's rows (`rows`, each by its columns): each a link of its role, after its from-entity's last one of
   * the role to that kind (its ordinal, which keeps their order). Answers the links' ids, in order.
   */
  static async insert(db: Db, name: string, rows: JoinValues[]): Promise<string[]> {
    if (rows.length === 0) return [];
    const join = Engine.storage().join(name);
    const role = Engine.storage().role(join.role, join.from, join.to);
    const columnOf = (part: LinkPart) => Object.entries(join.columns).find(([, value]) => value === part)?.[0];
    const fromColumn = columnOf("from")!;
    const fromIds = [...new Set(rows.map((row) => String(row[fromColumn])))];
    const last = await db
      .select({ fromId: entityLinksInRules.fromId, ordinal: max(entityLinksInRules.ordinal) })
      .from(entityLinksInRules)
      .where(StoredJoins.scope(name, inArray(entityLinksInRules.fromId, fromIds)))
      .groupBy(entityLinksInRules.fromId);
    const next = new Map(last.map((row) => [row.fromId, (row.ordinal ?? -1) + 1]));

    const value = (row: JoinValues, part: LinkPart) => {
      const column = columnOf(part);
      return column === undefined ? undefined : row[column];
    };
    const links = rows.map((row) => {
      const fromId = String(value(row, "from"));
      const ordinal = next.get(fromId) ?? 0;
      next.set(fromId, ordinal + 1);
      const viaId = (value(row, "via") as string | null | undefined) ?? null;
      return {
        id: value(row, "id") as string | undefined,
        fromId,
        fromType: join.from,
        role: join.role,
        single: role.single,
        toId: String(value(row, "to")),
        toType: join.to,
        viaId,
        viaType: viaId ? role.viaType : null,
        tier: (value(row, "tier") as number | null | undefined) ?? null,
        amount: (value(row, "amount") as number | null | undefined) ?? null,
        free: (value(row, "free") as boolean | undefined) ?? false,
        ordinal,
        createdAt: row.createdAt as string | undefined,
        updatedAt: row.updatedAt as string | undefined,
      };
    });
    const inserted: { id: string }[] = [];
    for (let i = 0; i < links.length; i += 2000)
      inserted.push(
        ...(await db
          .insert(entityLinksInRules)
          .values(links.slice(i, i + 2000))
          .returning({ id: entityLinksInRules.id })),
      );
    return inserted.map((row) => row.id);
  }

  /**
   * A join's rows' order: as they were made, each from-entity's in its order (its ordinal, which the migration kept
   * from its join table's order and a new link takes after its from-entity's last).
   */
  static order(): SQL[] {
    return [
      asc(entityLinksInRules.createdAt),
      asc(StoredJoins.part("from")),
      asc(entityLinksInRules.ordinal),
      asc(StoredJoins.part("to")),
    ];
  }

  /** A join's rows (`name`) a condition over its links picks (`where`), in their order: each by its columns. */
  static async rows<R>(db: Db, name: string, where?: SQL): Promise<R[]> {
    return (await db
      .select(StoredJoins.columns(name))
      .from(entityLinksInRules)
      .where(StoredJoins.scope(name, where))
      .orderBy(...StoredJoins.order())) as unknown as R[];
  }

  /** The condition that picks a join's links among every link (its role, from its kind to its other), and `where`. */
  static scope(name: string, where?: SQL): SQL {
    const join = Engine.storage().join(name);
    return and(
      eq(entityLinksInRules.role, join.role),
      eq(entityLinksInRules.fromType, join.from),
      eq(entityLinksInRules.toType, join.to),
      where,
    )!;
  }
}
