import { and, eq, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { usersInAccount } from "@/drizzle/schema.ts";
import { hashPassword } from "@/server/password.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";

import { toDeletedAddress } from "./deletedAddress.ts";

class UsersRepository extends BaseRepository<typeof usersInAccount> {
  constructor() {
    super(usersInAccount);
  }

  /**
   * An account's deletion: its address and username are free at once, and nothing it held lets anyone in. All of it in
   * this one statement, as `update` leaves an archived row alone, without an error.
   */
  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({
        deletedAt: new Date().toISOString(),
        emailAddress: toDeletedAddress(where.id),
        passwordDigest: null,
        pendingEmailAddress: null,
        updatedAt: new Date().toISOString(),
        username: null,
      })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async create(
    db: Db,
    values: {
      emailAddress: string;
      emailVerifiedAt?: string;
      password?: string;
      username?: string;
    },
  ) {
    const passwordDigest = values.password ? await hashPassword(values.password) : undefined;

    return await db
      .insert(this.table)
      .values({
        emailAddress: values.emailAddress,
        ...(passwordDigest ? { passwordDigest } : {}),
        ...(values.emailVerifiedAt ? { emailVerifiedAt: values.emailVerifiedAt } : {}),
      })
      .returning();
  }

  async findOne(
    db: Db,
    where: { id: string } | { emailAddress: string } | { username: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.usersInAccount.findFirst({
      where: this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "emailAddress" in where && eq(this.table.emailAddress, where.emailAddress),
          "username" in where && eq(this.table.username, where.username),
        ],
        [this.visibility(visibility)],
      ),
    });
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof usersInAccount>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default UsersRepository;
