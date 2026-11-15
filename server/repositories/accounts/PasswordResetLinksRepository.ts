import { eq, getTableColumns, gt, isNull, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { passwordResetLinksInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** What a link is read as: all but its token's digest, which never leaves the database. */
const { digest: _digest, ...SHOWN_COLUMNS } = getTableColumns(passwordResetLinksInAccount);

/**
 * The password reset links the instance's admins make: each resets one account's password once, within the hour after
 * it's made. The database keeps its token's digest alone.
 */
class PasswordResetLinksRepository extends BaseRepository<typeof passwordResetLinksInAccount> {
  constructor() {
    super(passwordResetLinksInAccount);
  }

  async create(db: Db, values: { createdBy: string; digest: string; expiresAt: string; userId: string }) {
    return await db.insert(this.table).values(values).returning(SHOWN_COLUMNS);
  }

  /** Deletes the links that expired before `expiresBefore` (the cleanup's), used or not. */
  async delete(db: Db, where: { expiresBefore: string }) {
    return await db.delete(this.table).where(lt(this.table.expiresAt, where.expiresBefore));
  }

  /** The link a token's digest names. */
  async findOne(db: Db, where: { digest: string }) {
    const [link] = await db.select(SHOWN_COLUMNS).from(this.table).where(eq(this.table.digest, where.digest));
    return link;
  }

  /**
   * Marks a link used (`usedAt`, `id`), or ends the links that still reset a password (`expiresAt`): an account's
   * (`userId`: another was made for it, or it was reset, signed out everywhere or given a password), or those an admin
   * made (`createdBy`: they're no longer one).
   */
  async update(
    db: Db,
    values: { expiresAt: string } | { usedAt: string },
    where: { createdBy: string } | { id: string } | { userId: string },
  ) {
    const now = new Date().toISOString();
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: now })
      .where(
        this.branchWhere(
          [
            "id" in where && eq(this.table.id, where.id),
            "userId" in where && eq(this.table.userId, where.userId),
            "createdBy" in where && eq(this.table.createdBy, where.createdBy),
          ],
          [isNull(this.table.usedAt), gt(this.table.expiresAt, now)],
        ),
      )
      .returning(SHOWN_COLUMNS);
  }
}

export default PasswordResetLinksRepository;
