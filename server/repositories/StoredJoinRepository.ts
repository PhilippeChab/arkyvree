import { and, inArray, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entityLinksInRules } from "@/drizzle/schema.ts";

import BaseRepository from "./BaseRepository.ts";
import StoredJoins, { type JoinValues } from "./stored/StoredJoins.ts";

/**
 * A join's repository (`join`: a feat's pools, a class level's grants), its rows (`R`) read from and written to the
 * generic links as its module declares them (`StoredJoins`): what holds each of its columns (`column`), its rows a
 * condition picks (`rows`), and its writes.
 */
abstract class StoredJoinRepository<R> extends BaseRepository<typeof entityLinksInRules> {
  protected abstract readonly join: string;

  constructor() {
    super(entityLinksInRules);
  }

  /** The join's rows a condition over its columns picks, removed: answers them as they were. */
  protected async remove(db: Db, where: SQL) {
    const rows = await this.rows(db, [where]);
    await db.delete(entityLinksInRules).where(StoredJoins.scope(this.join, where));
    return rows;
  }

  /** The join's rows a condition picks (`where`, over its columns), in their order. */
  protected async rows(db: Db, where: (SQL | false)[]): Promise<R[]> {
    const rows = await db
      .select(StoredJoins.columns(this.join))
      .from(entityLinksInRules)
      .where(StoredJoins.scope(this.join, this.where(where)))
      .orderBy(...StoredJoins.order());
    return rows as unknown as R[];
  }

  /** What holds a column of the join's row: a link's part. */
  protected override column(name: string) {
    const column = StoredJoins.columns(this.join)[name];
    if (!column) throw new Error(`${this.constructor.name}: its rows have no ${name} column`);
    return sql`${column}`;
  }

  async create(db: Db, values: JoinValues) {
    return await this.createMany(db, [values]);
  }

  /** Writes the join's new rows, each a link after its from-entity's last: answers them, in order. */
  async createMany(db: Db, values: JoinValues[]) {
    if (values.length === 0) return [];
    const ids = await StoredJoins.insert(db, this.join, values);
    const rows = await db
      .select({ ...StoredJoins.columns(this.join), linkId: entityLinksInRules.id })
      .from(entityLinksInRules)
      .where(and(inArray(entityLinksInRules.id, ids)));
    const byId = new Map(rows.map(({ linkId, ...row }) => [linkId, row]));
    return ids.map((id) => byId.get(id)!) as unknown as R[];
  }
}

export default StoredJoinRepository;
