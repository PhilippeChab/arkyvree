import { and, eq, getTableColumns, isNull, lt, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { apiKeysInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What a key shows its user: all but its digest, which never leaves the database. */
const { digest: _digest, ...SHOWN_COLUMNS } = getTableColumns(apiKeysInAccount);

class ApiKeysRepository extends BaseRepository<typeof apiKeysInAccount> {
  constructor() {
    super(apiKeysInAccount);
  }

  async create(db: Db, values: { digest: string; name: string; prefix: string; userId: string }) {
    return await db.insert(this.table).values(values).returning(SHOWN_COLUMNS);
  }

  async delete(db: Db, where: { id: string; userId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.id, where.id), eq(this.table.userId, where.userId)))
      .returning(SHOWN_COLUMNS);
  }

  /** A user's keys, the newest first. */
  async findMany(db: Db, where: { userId: string }) {
    return await db
      .select(SHOWN_COLUMNS)
      .from(this.table)
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .orderBy(this.orderBy(this.table.createdAt, "desc"), this.orderBy(this.table.id));
  }

  /** The key a token's digest names. */
  async findOne(db: Db, where: { digest: string }) {
    const [key] = await db
      .select(SHOWN_COLUMNS)
      .from(this.table)
      .where(and(eq(this.table.digest, where.digest), isNull(this.table.deletedAt)));
    return key;
  }

  /** Marks a key used now, unless it was used since `since`: a key's every request needn't write it. */
  async markUsed(db: Db, where: { id: string; since: string }) {
    await db
      .update(this.table)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(
        and(eq(this.table.id, where.id), or(isNull(this.table.lastUsedAt), lt(this.table.lastUsedAt, where.since))),
      );
  }
}

export default ApiKeysRepository;
