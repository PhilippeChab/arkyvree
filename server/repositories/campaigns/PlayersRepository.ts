import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { campaignsInCampaign, playersInCampaign, usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class PlayersRepository extends include(BaseRepository<typeof playersInCampaign>, Paginates, Searches) {
  constructor() {
    super(playersInCampaign);
  }

  async archive(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async create(db: Db, values: InferInsertModel<typeof playersInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  /** Whether the user plays in a live campaign on the ruleset: what lets a member create on a private ruleset. */
  /** Whether the user plays in a campaign on the ruleset. */
  async exists(db: Db, where: { userId: string; rulesetId: string }) {
    const [row] = await db
      .select({ one: sql`1` })
      .from(this.table)
      .innerJoin(campaignsInCampaign, eq(this.table.campaignId, campaignsInCampaign.id))
      .where(
        and(
          eq(this.table.userId, where.userId),
          isNull(this.table.deletedAt),
          isNull(campaignsInCampaign.deletedAt),
          eq(campaignsInCampaign.rulesetId, where.rulesetId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async findMany(
    db: Db,
    where: { campaignId: string } | { userId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.playersInCampaign.findMany({
      where: this.branchWhere(
        [
          "campaignId" in where && eq(this.table.campaignId, where.campaignId),
          "userId" in where && eq(this.table.userId, where.userId),
        ],
        [this.visibility(visibility)],
      ),
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; campaignId: string } | { userId: string; campaignId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.playersInCampaign.findFirst({
      where: this.branchWhere(
        ["id" in where && eq(this.table.id, where.id), "userId" in where && eq(this.table.userId, where.userId)],
        ["campaignId" in where && eq(this.table.campaignId, where.campaignId), this.visibility(visibility)],
      ),
    });
  }

  async findPage(
    db: Db,
    where: { campaignId: string; search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const { search, orderBy = "createdAt", orderDir = "asc" } = where;
    // Not correlated: the relational query aliases the players table, which a
    // subquery referencing `this.table` would miss.
    const searchCondition = search
      ? inArray(
          this.table.userId,
          db
            .select({ id: usersInAccount.id })
            .from(usersInAccount)
            .where(this.search(search, [usersInAccount.username, usersInAccount.emailAddress]) || undefined),
        )
      : false;

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.playersInCampaign.findMany({
        where: this.where([eq(this.table.campaignId, where.campaignId), this.visibility(visibility), searchCondition]),
        with: {
          usersInAccount: {
            columns: {
              id: true,
              username: true,
              emailAddress: true,
            },
          },
          invitesInCampaigns: {
            columns: {
              id: true,
              userId: true,
              email: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            },

            with: {
              usersInAccount: {
                columns: {
                  id: true,
                  username: true,
                  emailAddress: true,
                },
              },
            },
            where: (invites, { eq }) => and(eq(invites.status, "Pending"), isNull(invites.deletedAt)),
            orderBy: (invites) => [this.orderBy(invites.createdAt, "desc")],
            limit: 1, // latest invite
          },
        },
        orderBy: this.pageOrder(this.orderBy(this.table[orderBy], orderDir)),
        limit,
        offset,
      });
    });
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof playersInCampaign>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default PlayersRepository;
