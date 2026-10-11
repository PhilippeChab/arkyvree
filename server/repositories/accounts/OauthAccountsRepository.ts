import { and, eq, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { oauthAccountsInAccount } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class OauthAccountsRepository extends BaseRepository<typeof oauthAccountsInAccount> {
  constructor() {
    super(oauthAccountsInAccount);
  }

  async archive(db: Db, where: { id: string } | { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.branchWhere(
          ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
          [isNull(this.table.deletedAt)],
        ),
      )
      .returning();
  }

  async create(db: Db, values: { provider: string; providerAccountId: string; userId: string }) {
    return await db.insert(this.table).values(values).returning();
  }

  async findMany(db: Db, where: { userId: string }) {
    return await db.query.oauthAccountsInAccount.findMany({
      where: and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)),
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { provider: string; providerAccountId: string } | { provider: string; userId: string },
  ) {
    return await db.query.oauthAccountsInAccount.findFirst({
      where: this.branchWhere(
        [
          "id" in where && !("provider" in where) && eq(this.table.id, where.id),
          "providerAccountId" in where &&
            eq(this.table.provider, where.provider) &&
            eq(this.table.providerAccountId, where.providerAccountId),
          "userId" in where && eq(this.table.userId, where.userId) && eq(this.table.provider, where.provider),
        ],
        [isNull(this.table.deletedAt)],
      ),
    });
  }
}

export default OauthAccountsRepository;
