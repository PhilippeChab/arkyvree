import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { sessionsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";
import { SESSION_TTL_MS } from "@/server/middlewares/session.ts";

class SessionsRepository extends BaseRepository<typeof sessionsInAccount, SessionInstance> {
  constructor() {
    super(sessionsInAccount);
  }

  async create(db: Db, values: { userId: string; expiresAt?: string }) {
    const expiresAt = values.expiresAt ?? new Date(Date.now() + SESSION_TTL_MS).toISOString();
    return await db.insert(this.table).values({ userId: values.userId, expiresAt }).returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof sessionsInAccount>>, where: { id: string }) {
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

  async findOne(db: Db, where: { id: string }) {
    return await db.query.sessionsInAccount.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }

  async delete(db: Db, where: { id: string } | { expiredOrArchivedBefore: string }) {
    return await db
      .delete(this.table)
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "expiredOrArchivedBefore" in where
          && (or(isNotNull(this.table.deletedAt), lt(this.table.expiresAt, where.expiredOrArchivedBefore)) ?? false),
      ]));
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async findMany(db: Db, where: { userId: string }) {
    return await db.query.sessionsInAccount.findMany({
      where: and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)),
    });
  }

  withInstance(instance: InferSelectModel<typeof sessionsInAccount>) {
    return new SessionInstance(instance);
  }
}

class SessionInstance extends Instance<InferSelectModel<typeof sessionsInAccount>> {}

export default SessionsRepository;
