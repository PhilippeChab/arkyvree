import { and, eq, isNull } from "drizzle-orm";

import { oauthAccountsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class OauthAccountsRepository extends BaseRepository<typeof oauthAccountsInAccount> {
  constructor() {
    super(oauthAccountsInAccount);
  }

  async findManyByUser(db: Db, where: { userId: string }) {
    return await db.query.oauthAccountsInAccount.findMany({
      where: and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)),
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { provider: string; providerAccountId: string } | { userId: string; provider: string },
  ) {
    return await db.query.oauthAccountsInAccount.findFirst({
      where: this.where([
        "id" in where && !("provider" in where) && eq(this.table.id, where.id),
        "providerAccountId" in where &&
          eq(this.table.provider, where.provider) &&
          eq(this.table.providerAccountId, where.providerAccountId),
        "userId" in where && eq(this.table.userId, where.userId) && eq(this.table.provider, where.provider),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async create(db: Db, values: { userId: string; provider: string; providerAccountId: string }) {
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
}

export default OauthAccountsRepository;
