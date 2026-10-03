import { eq, isNull, lt } from "drizzle-orm";

import type { emailVerificationsInAccount, passwordResetsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** The codes a user is emailed, one table per use: verifying an email, resetting a password. */
class AccountCodesRepository extends BaseRepository<
  typeof emailVerificationsInAccount | typeof passwordResetsInAccount
> {
  /** The user's latest code, or the one `id` names. */
  async findOne(db: Db, where: { userId: string } | { id: string }) {
    const codes = await db
      .select()
      .from(this.table)
      .where(
        this.where([
          "id" in where && eq(this.table.id, where.id),
          "userId" in where && eq(this.table.userId, where.userId),
          isNull(this.table.deletedAt),
        ]),
      )
      .orderBy(this.orderBy(this.table.createdAt, "desc"))
      .limit(1);
    return codes.at(0);
  }

  async create(db: Db, values: { userId: string; code: string; expiresAt: string }) {
    return await db.insert(this.table).values(values).returning();
  }

  async archive(db: Db, where: { id: string } | { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.writeWhere(
          ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
          [isNull(this.table.deletedAt)],
        ),
      )
      .returning();
  }

  async delete(db: Db, where: { id: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.writeWhere([
          "id" in where && eq(this.table.id, where.id),
          "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
        ]),
      );
  }
}

export default AccountCodesRepository;
