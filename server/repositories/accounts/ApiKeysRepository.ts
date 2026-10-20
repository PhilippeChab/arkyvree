import { and, count, eq, getTableColumns, gt, isNull, lt, or } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { apiKeysInAccount, usersInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What a key shows its user: all but its digest, which never leaves the database. */
const { digest: _digest, ...SHOWN_COLUMNS } = getTableColumns(apiKeysInAccount);

class ApiKeysRepository extends BaseRepository<typeof apiKeysInAccount> {
  constructor() {
    super(apiKeysInAccount);
  }

  /** A key that works: neither archived nor expired. */
  private working() {
    return and(
      isNull(this.table.deletedAt),
      or(isNull(this.table.expiresAt), gt(this.table.expiresAt, new Date().toISOString())),
    );
  }

  /** How many keys a user has that work: none archived or expired. */
  async count(db: Db, where: { userId: string }) {
    const [row] = await db
      .select({ count: count() })
      .from(this.table)
      .where(and(eq(this.table.userId, where.userId), this.working()));
    return row?.count ?? 0;
  }

  async create(
    db: Db,
    values: { digest: string; expiresAt: string | null; name: string; prefix: string; userId: string },
  ) {
    return await db.insert(this.table).values(values).returning(SHOWN_COLUMNS);
  }

  /**
   * Deletes one of a user's keys, or every key of theirs, or the keys expired before a time (`expiresBefore`, the
   * cleanup's): a deleted key's token names no key from then on.
   */
  async delete(db: Db, where: { id: string; userId: string } | { userId: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where && (and(eq(this.table.id, where.id), eq(this.table.userId, where.userId)) ?? false),
          "userId" in where && !("id" in where) && eq(this.table.userId, where.userId),
          "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
        ]),
      )
      .returning(SHOWN_COLUMNS);
  }

  /** A user's keys that work, the newest first: an expired one is gone to its user, before the cleanup deletes it. */
  async findMany(db: Db, where: { userId: string }) {
    return await db
      .select(SHOWN_COLUMNS)
      .from(this.table)
      .where(and(eq(this.table.userId, where.userId), this.working()))
      .orderBy(this.orderBy(this.table.createdAt, "desc"), this.orderBy(this.table.id));
  }

  /**
   * The key a token's digest names, unless it's archived or expired, with whether its user is a demo's
   * (`userExpiresAt`): none when its user's account is deleted.
   */
  async findOneWithUser(db: Db, where: { digest: string }) {
    const [key] = await db
      .select({ ...SHOWN_COLUMNS, userExpiresAt: usersInAccount.expiresAt })
      .from(this.table)
      .innerJoin(usersInAccount, and(eq(usersInAccount.id, this.table.userId), isNull(usersInAccount.deletedAt)))
      .where(and(eq(this.table.digest, where.digest), this.working()));
    return key;
  }

  /** Marks a key used now, unless it was used since `since`: a key's every request needn't write it. */
  async markUsed(db: Db, where: { id: string; since: string }) {
    await db
      .update(this.table)
      .set({ lastUsedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        and(eq(this.table.id, where.id), or(isNull(this.table.lastUsedAt), lt(this.table.lastUsedAt, where.since))),
      );
  }
}

export default ApiKeysRepository;
