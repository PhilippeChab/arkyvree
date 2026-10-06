import { and, eq, isNotNull, isNull, lt, ne, or } from "drizzle-orm";

import { sessionsInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

import { SESSION_TTL_MS } from "./sessionTtl.ts";

class SessionsRepository extends BaseRepository<typeof sessionsInAccount> {
  constructor() {
    super(sessionsInAccount);
  }

  async archive(db: Db, where: { id: string } | { userId: string; exceptId?: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(
        this.branchWhere(
          ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
          ["exceptId" in where && !!where.exceptId && ne(this.table.id, where.exceptId), isNull(this.table.deletedAt)],
        ),
      )
      .returning();
  }

  async create(db: Db, values: { userId: string; expiresAt?: string }) {
    const expiresAt = values.expiresAt ?? new Date(Date.now() + SESSION_TTL_MS).toISOString();
    return await db.insert(this.table).values({ userId: values.userId, expiresAt }).returning();
  }

  async delete(db: Db, where: { id: string } | { expiredOrArchivedBefore: string }) {
    return await db
      .delete(this.table)
      .where(
        this.branchWhere([
          "id" in where && eq(this.table.id, where.id),
          "expiredOrArchivedBefore" in where &&
            (or(isNotNull(this.table.deletedAt), lt(this.table.expiresAt, where.expiredOrArchivedBefore)) ?? false),
        ]),
      );
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.sessionsInAccount.findFirst({
      where: and(eq(this.table.id, where.id), isNull(this.table.deletedAt)),
    });
  }
}

export default SessionsRepository;
