import { and, count, eq, type InferInsertModel, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import { hashPassword } from "@/server/password.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

import { toDeletedAddress } from "./deletedAddress.ts";

/** What the instance's admins see of an account in its list: never its password's digest. */
const LISTED_COLUMNS = {
  createdAt: usersInAccount.createdAt,
  deactivatedAt: usersInAccount.deactivatedAt,
  emailAddress: usersInAccount.emailAddress,
  emailVerifiedAt: usersInAccount.emailVerifiedAt,
  id: usersInAccount.id,
  isAdmin: usersInAccount.isAdmin,
  username: usersInAccount.username,
};

class UsersRepository extends include(BaseRepository<typeof usersInAccount>, Paginates, Searches) {
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

  /** The instance's admins who can act (`isAdmin`): their accounts neither deleted nor deactivated. */
  async count(db: Db, where: { isAdmin: true }) {
    const [row] = await db
      .select({ count: count() })
      .from(this.table)
      .where(
        and(eq(this.table.isAdmin, where.isAdmin), isNull(this.table.deletedAt), isNull(this.table.deactivatedAt)),
      );
    return row?.count ?? 0;
  }

  async create(
    db: Db,
    values: {
      emailAddress: string;
      emailVerifiedAt?: string;
      isAdmin?: boolean;
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
        ...(values.isAdmin ? { isAdmin: true } : {}),
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

  /**
   * The instance's accounts, as its admins list them (`LISTED_COLUMNS`), the newest first: their deleted ones aside,
   * those whose address or username holds `search`.
   */
  async findPage(db: Db, where: { search?: string }, pagination: Pagination) {
    return await this.withPagination(pagination, async ({ limit, offset }) =>
      db
        .select(LISTED_COLUMNS)
        .from(this.table)
        .where(
          and(
            isNull(this.table.deletedAt),
            this.search(where.search, [this.table.emailAddress, this.table.username]) || undefined,
          ),
        )
        .orderBy(...this.pageOrder(this.orderBy(this.table.createdAt, "desc")))
        .limit(limit)
        .offset(offset),
    );
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
