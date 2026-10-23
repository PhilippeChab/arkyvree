import { asc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";

import BaseRepository from "./BaseRepository.ts";
import { GuardsStaleEdits } from "./concerns/GuardsStaleEdits.ts";
import StoredEntities, { type StoredValues } from "./stored/StoredEntities.ts";

/**
 * An entity kind's repository (`entityType`), its rows (`R`) read from and written to the generic tables as its module
 * declares them (`StoredEntities`): what holds each of its columns (`column`), its rows a condition picks (`rows`), and
 * the writes every kind makes the same way.
 */
abstract class StoredKindRepository<R extends { id: string }> extends include(BaseRepository, GuardsStaleEdits)<
  typeof entitiesInRules
> {
  protected abstract readonly entityType: string;

  constructor() {
    super(entitiesInRules);
  }

  /** The kind's rows a condition picks (`where`, over its columns), in `order`, a page of them if `page` says. */
  protected async rows(
    db: Db,
    where: (SQL | boolean | undefined)[],
    order: SQL[] = [this.orderBy(this.column("id"))],
    page?: { limit: number; offset: number },
  ): Promise<R[]> {
    const query = db
      .select(StoredEntities.columns(this.entityType))
      .from(entitiesInRules)
      .where(this.where([StoredEntities.scope(this.entityType), ...where.map((condition) => condition ?? false)]))
      .orderBy(...order);
    const rows = page ? await query.limit(page.limit).offset(page.offset) : await query;
    return rows as unknown as R[];
  }

  /** The kind's rows by id, in the order of `ids`. */
  protected async rowsById(db: Db, ids: string[]): Promise<R[]> {
    if (ids.length === 0) return [];
    const rows = await this.rows(db, [inArray(entitiesInRules.id, ids)], [asc(entitiesInRules.id)]);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.map((id) => byId.get(id)).filter((row): row is R => row !== undefined);
  }

  /** What holds a column of the kind's row: an entity's own column, or what its field or its link holds. */
  protected override column(name: string) {
    const column = StoredEntities.columns(this.entityType)[name];
    if (!column) throw new Error(`${this.constructor.name}: its rows have no ${name} column`);
    return sql`${column}`;
  }

  async create(db: Db, values: StoredValues) {
    return await this.createMany(db, [values]);
  }

  /** Writes the kind's new rows, each an entity and what its columns hold: answers them, in order. */
  async createMany(db: Db, values: StoredValues[]) {
    return await this.rowsById(db, await StoredEntities.insert(db, this.entityType, values));
  }

  /** Deletes an entity of the kind: its fields and links go with it, and what deleting it does to others' its roles say. */
  async delete(db: Db, where: { id: string }) {
    const rows = await this.rowsById(db, [where.id]);
    await db
      .delete(entitiesInRules)
      .where(this.where([StoredEntities.scope(this.entityType), eq(entitiesInRules.id, where.id)]));
    return rows;
  }

  /**
   * Writes a change to a live row of the kind (`values`: the columns it sets), if it's still the version the editor
   * read (`expectedUpdatedAt`): answers it as written, or nothing.
   */
  async update(db: Db, values: StoredValues, where: { expectedUpdatedAt?: string; id: string }) {
    const ids = await StoredEntities.update(
      db,
      this.entityType,
      values,
      this.where([
        eq(entitiesInRules.id, where.id),
        isNull(entitiesInRules.deletedAt),
        this.casUpdatedAt(where.expectedUpdatedAt),
      ])!,
    );
    return await this.rowsById(db, ids);
  }
}

export default StoredKindRepository;
