import { and, eq, getTableColumns, isNull, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { inviteLinksInAccount, usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";

/** What a link shows its admins: all but its token's digest, which never leaves the database. */
const { digest: _digest, ...SHOWN_COLUMNS } = getTableColumns(inviteLinksInAccount);

/**
 * The instance's invite links: each lets anyone who opens it sign up while sign-ups take invites, until it expires or an
 * admin revokes it. The database keeps its token's digest alone.
 */
class InviteLinksRepository extends include(BaseRepository<typeof inviteLinksInAccount>, Paginates) {
  constructor() {
    super(inviteLinksInAccount);
  }

  async create(db: Db, values: { createdBy: string; digest: string; expiresAt: string }) {
    return await db.insert(this.table).values(values).returning(SHOWN_COLUMNS);
  }

  /** The link a token's digest names, or the one an id names. */
  async findOne(db: Db, where: { digest: string } | { id: string }) {
    const [link] = await db
      .select(SHOWN_COLUMNS)
      .from(this.table)
      .where(
        this.branchWhere([
          "digest" in where && eq(this.table.digest, where.digest),
          "id" in where && eq(this.table.id, where.id),
        ]),
      );
    return link;
  }

  /**
   * The instance's links, a page at a time, the newest first, each with who made it and how many accounts signed up
   * with it (`accounts`, a deleted one left out).
   */
  async findPage(db: Db, pagination: Pagination) {
    return await this.withPagination(pagination, async ({ limit, offset }) =>
      db
        .select({
          ...SHOWN_COLUMNS,
          accounts: sql<number>`(SELECT count(*)::int FROM ${usersInAccount} WHERE ${usersInAccount.inviteLinkId} = ${this.table.id} AND ${usersInAccount.deletedAt} IS NULL)`,
          creatorEmailAddress: usersInAccount.emailAddress,
          creatorUsername: usersInAccount.username,
        })
        .from(this.table)
        .innerJoin(usersInAccount, eq(usersInAccount.id, this.table.createdBy))
        .orderBy(...this.pageOrder(this.orderBy(this.table.createdAt, "desc")))
        .limit(limit)
        .offset(offset),
    );
  }

  /** Revokes a link not yet revoked (`revokedAt`): it lets nobody sign up from then on. Nothing when it already is. */
  async update(db: Db, values: { revokedAt: string }, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: values.revokedAt })
      .where(and(eq(this.table.id, where.id), isNull(this.table.revokedAt)))
      .returning(SHOWN_COLUMNS);
  }
}

export default InviteLinksRepository;
