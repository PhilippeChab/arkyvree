import { and, eq, isNull, lt } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { passwordResetsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

class PasswordResetsRepository extends BaseRepository<typeof passwordResetsInAccount, PasswordResetInstance> {
  constructor() {
    super(passwordResetsInAccount);
  }

  async create(db: Db, values: { userId: string; code: string; expiresAt: string }) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof passwordResetsInAccount>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async delete(db: Db, where: { id: string } | { expiresBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "expiresBefore" in where && lt(this.table.expiresAt, where.expiresBefore),
      ]));
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async findOne(db: Db, where: { userId: string } | { id: string }) {
    return await db.query.passwordResetsInAccount.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "userId" in where && eq(this.table.userId, where.userId),
        isNull(this.table.deletedAt),
      ]),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
  }

  withInstance(instance: InferSelectModel<typeof passwordResetsInAccount>) {
    return new PasswordResetInstance(instance);
  }
}

class PasswordResetInstance extends Instance<InferSelectModel<typeof passwordResetsInAccount>> {}

export default PasswordResetsRepository;
