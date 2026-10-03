import { and, eq, type InferInsertModel, isNotNull, isNull, like, lt } from "drizzle-orm";

import { usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { hashPassword } from "@/server/password.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";

class UsersRepository extends BaseRepository<typeof usersInAccount> {
  constructor() {
    super(usersInAccount);
  }

  async create(
    db: Db,
    values: {
      username?: string;
      emailAddress: string;
      password?: string;
      expiresAt?: string;
      emailVerifiedAt?: string;
    },
  ) {
    const passwordDigest = values.password ? await hashPassword(values.password) : undefined;

    return await db
      .insert(this.table)
      .values({
        emailAddress: values.emailAddress,
        ...(passwordDigest ? { passwordDigest } : {}),
        ...(values.expiresAt ? { expiresAt: values.expiresAt } : {}),
        ...(values.emailVerifiedAt ? { emailVerifiedAt: values.emailVerifiedAt } : {}),
      })
      .returning();
  }

  async delete(db: Db, where: { id: string } | { expiredDemosBefore: string }) {
    const isDemo = and(isNotNull(this.table.expiresAt), like(this.table.emailAddress, "%@demo.invalid"));
    if ("id" in where) {
      return await db.delete(this.table).where(and(eq(this.table.id, where.id), isDemo));
    }
    return await db.delete(this.table).where(and(isDemo, lt(this.table.expiresAt, where.expiredDemosBefore)));
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof usersInAccount>>, where: { id: string }) {
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

  async findOne(
    db: Db,
    where: { id: string } | { emailAddress: string } | { username: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.usersInAccount.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "emailAddress" in where && eq(this.table.emailAddress, where.emailAddress),
        "username" in where && eq(this.table.username, where.username),
        this.visibility(visibility),
      ]),
    });
  }
}

export default UsersRepository;
