import { and, eq, inArray, type InferInsertModel, isNotNull, isNull, like, lt } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { usersInAccount } from "@/drizzle/schema.ts";
import { hashPassword } from "@/server/password.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";

import { toDeletedAddress } from "./deletedAddress.ts";

class UsersRepository extends BaseRepository<typeof usersInAccount> {
  constructor() {
    super(usersInAccount);
  }

  /** A demo account: one that expires, at the demo's address. */
  private isDemo() {
    return and(isNotNull(this.table.expiresAt), like(this.table.emailAddress, "%@demo.invalid"));
  }

  /** A demo account, by its id: a real one isn't deleted here. */
  private async deleteDemo(db: Db, id: string) {
    return await db.delete(this.table).where(and(eq(this.table.id, id), this.isDemo()));
  }

  /** The demo accounts of `ids` that expired before then: one whose expiry moved since it was found stays. */
  private async deleteExpiredDemos(db: Db, before: string, ids: string[]) {
    if (ids.length === 0) return { rowCount: 0 };
    return await db
      .delete(this.table)
      .where(and(inArray(this.table.id, ids), this.isDemo(), lt(this.table.expiresAt, before)));
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
      expiresAt?: string;
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
        ...(values.expiresAt ? { expiresAt: values.expiresAt } : {}),
        ...(values.emailVerifiedAt ? { emailVerifiedAt: values.emailVerifiedAt } : {}),
      })
      .returning();
  }

  async delete(db: Db, where: { id: string } | { expiredDemosBefore: string; ids: string[] }) {
    if ("id" in where) return await this.deleteDemo(db, where.id);
    return await this.deleteExpiredDemos(db, where.expiredDemosBefore, where.ids);
  }

  /**
   * The ids of the demo accounts that expired before then (`expiredDemosBefore`), which the cleanup deletes once it
   * locks them.
   */
  async findIds(db: Db, where: { expiredDemosBefore: string }): Promise<string[]> {
    const rows = await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(and(this.isDemo(), lt(this.table.expiresAt, where.expiredDemosBefore)));
    return rows.map((row) => row.id);
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
