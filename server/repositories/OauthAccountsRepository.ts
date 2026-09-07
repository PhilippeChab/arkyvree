import { and, eq, isNull } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { oauthAccountsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

class OauthAccountsRepository extends BaseRepository<typeof oauthAccountsInAccount, OauthAccountInstance> {
  constructor() {
    super(oauthAccountsInAccount);
  }

  async create(db: Db, values: { userId: string; provider: string; providerAccountId: string }) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof oauthAccountsInAccount>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async findOne(
    db: Db,
    where: { id: string } | { provider: string; providerAccountId: string } | { userId: string; provider: string },
  ) {
    return await db.query.oauthAccountsInAccount.findFirst({
      where: this.where([
        "id" in where && !("provider" in where) && eq(this.table.id, where.id),
        "providerAccountId" in where && eq(this.table.provider, where.provider) && eq(this.table.providerAccountId, where.providerAccountId),
        "userId" in where && eq(this.table.userId, where.userId) && eq(this.table.provider, where.provider),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findManyByUser(db: Db, where: { userId: string }) {
    return await db.query.oauthAccountsInAccount.findMany({
      where: and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)),
    });
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  withInstance(instance: InferSelectModel<typeof oauthAccountsInAccount>) {
    return new OauthAccountInstance(instance);
  }
}

class OauthAccountInstance extends Instance<InferSelectModel<typeof oauthAccountsInAccount>> {}

export default OauthAccountsRepository;
