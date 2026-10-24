import { and, eq, inArray, max, type SQL } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entityLinksInRules } from "@/drizzle/schema.ts";
import { Engine, type StoredLink } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A join's row, any join's, as its module's declaration reads a link (a class level's grant, a feat's pool). */
export type JoinRow = Record<string, unknown>;

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/**
 * Every module's joins (a feat's pools, a class level's grants), as the generic tables store them: links of a role
 * from one kind to another (`rules.entity_links`), by the join's name (`join`), each row as its module's declaration
 * reads a link (`Engine.storage().joinRowsOf`), each write as it splits one (`linkOf`). New links come after their
 * from-entity's last of the join, which keeps their order.
 */
class StoredJoins extends BaseRepository<typeof entityLinksInRules> {
  constructor() {
    super(entityLinksInRules);
  }

  /** The condition that picks a join's links among every link (its role, from its kind to its other), and `where`. */
  private static buildScope(join: string, where?: SQL): SQL {
    const { from, role, to } = Engine.storage().join(join);
    return and(
      eq(entityLinksInRules.role, role),
      eq(entityLinksInRules.fromType, from),
      eq(entityLinksInRules.toType, to),
      where,
    )!;
  }

  /** The links a condition picks, each with its from-entity's id. */
  private async links(db: Db, where: SQL) {
    return await db
      .select({
        fromId: entityLinksInRules.fromId,
        id: entityLinksInRules.id,
        role: entityLinksInRules.role,
        toId: entityLinksInRules.toId,
        toType: entityLinksInRules.toType,
        viaId: entityLinksInRules.viaId,
        tier: entityLinksInRules.tier,
        amount: entityLinksInRules.amount,
        free: entityLinksInRules.free,
        ordinal: entityLinksInRules.ordinal,
        createdAt: entityLinksInRules.createdAt,
        updatedAt: entityLinksInRules.updatedAt,
      })
      .from(entityLinksInRules)
      .where(where);
  }

  /** A join's rows a condition over its links picks, in their order. */
  private async rows(db: Db, join: string, where: SQL): Promise<JoinRow[]> {
    const links = await this.links(db, StoredJoins.buildScope(join, where));
    const fromType = Engine.storage().join(join).from;
    const byFrom = new Map<string, StoredLink[]>();
    for (const { fromId, ...link } of links) byFrom.set(fromId, [...(byFrom.get(fromId) ?? []), link]);
    return Engine.storage().joinRowsOf(
      join,
      [...byFrom].map(([id, held]) => ({ id, links: held, type: fromType })),
    );
  }

  async create<R extends object = JoinRow>(db: Db, join: string, values: JoinRow) {
    return await this.createMany<R>(db, join, [values]);
  }

  /** Writes a join's new rows, each a link after its from-entity's last: answers their links' ids, in order. */
  async createIds(db: Db, join: string, values: JoinRow[]): Promise<string[]> {
    if (values.length === 0) return [];
    const storage = Engine.storage();
    const declared = storage.join(join);
    const role = storage.role(declared.role, declared.from, declared.to);
    const links = values.map((row) => storage.linkOf(join, row));
    const fromIds = [...new Set(links.map((link) => link.fromId))];
    const last = await db
      .select({ fromId: entityLinksInRules.fromId, ordinal: max(entityLinksInRules.ordinal) })
      .from(entityLinksInRules)
      .where(StoredJoins.buildScope(join, inArray(entityLinksInRules.fromId, fromIds)))
      .groupBy(entityLinksInRules.fromId);
    const next = new Map(last.map((row) => [row.fromId, (row.ordinal ?? -1) + 1]));
    const rows = links.map((link) => {
      const ordinal = next.get(link.fromId) ?? 0;
      next.set(link.fromId, ordinal + 1);
      return {
        ...link,
        fromType: declared.from,
        role: declared.role,
        single: role.single,
        toType: declared.to,
        viaType: link.viaId ? role.viaType : null,
        ordinal,
      };
    });
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += WRITE_BATCH) {
      const inserted = await db
        .insert(entityLinksInRules)
        .values(rows.slice(i, i + WRITE_BATCH))
        .returning({ id: entityLinksInRules.id });
      ids.push(...inserted.map((row) => row.id));
    }
    return ids;
  }

  /**
   * Writes a join's new rows, each a link after its from-entity's last, all from one entity's when given (`fromId`, its
   * column's, which the rows leave out): answers them, in order.
   */
  async createMany<R extends object = JoinRow>(
    db: Db,
    join: string,
    values: JoinRow[],
    from?: { fromId: string },
  ): Promise<R[]> {
    const column = from ? Engine.storage().joinFromColumn(join) : undefined;
    const rows = column ? values.map((row) => ({ ...row, [column]: from?.fromId })) : values;
    const ids = await this.createIds(db, join, rows);
    if (ids.length === 0) return [];
    const storage = Engine.storage();
    const declared = storage.join(join);
    const written = await this.links(db, inArray(entityLinksInRules.id, ids));
    const byId = new Map(written.map((link) => [link.id, link]));
    return ids.map((id) => {
      const { fromId, ...link } = byId.get(id)!;
      return storage.joinRowsOf(join, [{ id: fromId, links: [link], type: declared.from }])[0] as R;
    });
  }

  /** Removes an entity's links of a join (`fromId`), those to `toId` if given: answers them as they were. */
  async delete<R extends object = JoinRow>(db: Db, where: { fromId: string; join: string; toId?: string }) {
    const picked = this.branchWhere(
      [where.fromId !== undefined && eq(entityLinksInRules.fromId, where.fromId)],
      [where.toId !== undefined && eq(entityLinksInRules.toId, where.toId)],
    )!;
    const rows = (await this.rows(db, where.join, picked)) as R[];
    await db.delete(entityLinksInRules).where(StoredJoins.buildScope(where.join, picked));
    return rows;
  }

  /** A join's rows from entities (`fromIds`), to entities (`toIds`) or through them (`viaIds`), in their order. */
  async findMany<R extends object = JoinRow>(
    db: Db,
    where: { fromIds: string[]; join: string } | { join: string; toIds: string[] } | { join: string; viaIds: string[] },
  ): Promise<R[]> {
    const ids = "fromIds" in where ? where.fromIds : "toIds" in where ? where.toIds : where.viaIds;
    if (ids.length === 0) return [];
    const column =
      "fromIds" in where
        ? entityLinksInRules.fromId
        : "toIds" in where
          ? entityLinksInRules.toId
          : entityLinksInRules.viaId;
    return (await this.rows(db, where.join, inArray(column, ids))) as R[];
  }

  /** Whether a link of a join points at an entity (`toId`): an in-use check. */
  async has(db: Db, where: { join: string; toId: string }) {
    const [link] = await db
      .select({ id: entityLinksInRules.id })
      .from(entityLinksInRules)
      .where(StoredJoins.buildScope(where.join, eq(entityLinksInRules.toId, where.toId)))
      .limit(1);
    return link !== undefined;
  }

  /**
   * Whether a link of a join that refuses its target's delete points at an entity of a kind (`toType`, `toId`): an
   * in-use check (a class level's base bonus to a save, whose delete the database would refuse).
   */
  async hasRefusing(db: Db, where: { toId: string; toType: string }) {
    for (const join of Engine.storage().refusingJoins(where.toType))
      if (await this.has(db, { join, toId: where.toId })) return true;
    return false;
  }
}

export default StoredJoins;
