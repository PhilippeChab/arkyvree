import {
  and,
  count,
  eq,
  inArray,
  type InferInsertModel,
  isNotNull,
  isNull,
  ne,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { campaignsInCampaign, invitesInCampaign, playersInCampaign, usersInAccount } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import type { CampaignRole } from "@/shared/enums.ts";

/** The columns of a players query's row that its subquery reads (`joinedAt`). */
interface SlotColumns {
  createdAt: SQLWrapper;
  id: SQLWrapper;
  userId: SQLWrapper;
}

/**
 * A column of a table a subquery names `alias`: a players query renders every column it names as the players table's
 * own, so a subquery's are named by hand.
 */
function aliasedColumn(alias: string, column: PgColumn) {
  return sql`${sql.identifier(alias)}.${sql.identifier(column.name)}`;
}

/**
 * When a slot's user joined: its accepted invite's answer, or the slot's creation for one made with its user (a
 * campaign's first Game Master); none while it has no user (an empty slot). A slot archived with its user's account
 * keeps its user, and so its date.
 */
function joinedAt(slot: SlotColumns) {
  const invite = (column: PgColumn) => aliasedColumn("accepted", column);
  return sql<string | null>`case when ${slot.userId} is not null then coalesce(
    (select max(${invite(invitesInCampaign.updatedAt)}) from ${invitesInCampaign} as ${sql.identifier("accepted")}
      where ${invite(invitesInCampaign.playerId)} = ${slot.id} and ${invite(invitesInCampaign.status)} = 'Accepted'),
    ${slot.createdAt}
  ) end`;
}

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

  /** A campaign's live, seated players of a role: an empty slot runs nothing. */
  async count(db: Db, where: { campaignId: string; role: CampaignRole }) {
    const [result] = await db
      .select({ count: count() })
      .from(this.table)
      .where(
        and(
          eq(this.table.campaignId, where.campaignId),
          eq(this.table.role, where.role),
          isNotNull(this.table.userId),
          isNull(this.table.deletedAt),
        ),
      );
    return result.count;
  }

  async create(db: Db, values: InferInsertModel<typeof playersInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  /**
   * A campaign's live seats a user holds, but `otherThanUserId`'s, the longest-seated first, in the order the Joined
   * date gives (`joinedAt`, never a slot's own age: a slot can be made long before anyone takes it): who an account's
   * deletion can leave a campaign to.
   */
  async findHeirs(db: Db, where: { campaignId: string; otherThanUserId: string }) {
    return await db
      .select({ id: this.table.id, role: this.table.role, userId: sql<string>`${this.table.userId}` })
      .from(this.table)
      .where(
        and(
          eq(this.table.campaignId, where.campaignId),
          isNotNull(this.table.userId),
          ne(this.table.userId, where.otherThanUserId),
          isNull(this.table.deletedAt),
        ),
      )
      .orderBy(this.orderBy(joinedAt(this.table)), this.orderBy(this.table.id));
  }

  /** A campaign's players, a user's seats, or a user's seats in some campaigns (`campaignIds`: a page's). */
  async findMany(
    db: Db,
    where: { campaignId: string } | { campaignIds: string[]; userId: string } | { userId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    if ("campaignIds" in where && where.campaignIds.length === 0) return [];
    return await db.query.playersInCampaign.findMany({
      where: this.branchWhere(
        [
          "campaignId" in where && eq(this.table.campaignId, where.campaignId),
          "userId" in where && eq(this.table.userId, where.userId),
        ],
        ["campaignIds" in where && inArray(this.table.campaignId, where.campaignIds), this.visibility(visibility)],
      ),
    });
  }

  async findOne(
    db: Db,
    where: { id: string } | { campaignId: string; id: string } | { campaignId: string; userId: string },
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
    where: {
      campaignId: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
      searchAddresses?: boolean;
    },
    pagination: Pagination,
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const { search, orderBy = "createdAt", orderDir = "asc", searchAddresses = true } = where;
    const searched = searchAddresses
      ? [usersInAccount.username, usersInAccount.emailAddress]
      : [usersInAccount.username];
    // Not correlated: the relational query aliases the players table, which a
    // subquery referencing `this.table` would miss. A deleted account's row names no one: a search leaves it out
    const searchCondition = search
      ? inArray(
          this.table.userId,
          db
            .select({ id: usersInAccount.id })
            .from(usersInAccount)
            .where(and(isNull(usersInAccount.deletedAt), this.search(search, searched) || undefined)),
        )
      : false;

    return await this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.playersInCampaign.findMany({
          where: this.where([
            eq(this.table.campaignId, where.campaignId),
            this.visibility(visibility),
            searchCondition,
          ]),
          extras: (players) => ({
            joinedAt: joinedAt(players).as("joined_at"),
          }),
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
        }),
    );
  }

  /**
   * The rulesets of `rulesetIds` the user has a live seat in a campaign on, archived or not (what lets them read it, as
   * it lets them read the campaign), each with whether one is in a live campaign (`live`: what lets them create on it),
   * by ruleset. A removed player's seat is deleted, and a seat is archived only with its user's account, so neither
   * gives one.
   */
  async findSeatPerRuleset(db: Db, where: { rulesetIds: string[]; userId: string }) {
    if (where.rulesetIds.length === 0) return new Map<string, { live: boolean }>();
    const rows = await db
      .select({
        live: sql<boolean>`bool_or(${campaignsInCampaign.deletedAt} is null)`,
        rulesetId: campaignsInCampaign.rulesetId,
      })
      .from(this.table)
      .innerJoin(campaignsInCampaign, eq(this.table.campaignId, campaignsInCampaign.id))
      .where(
        and(
          eq(this.table.userId, where.userId),
          inArray(campaignsInCampaign.rulesetId, where.rulesetIds),
          isNull(this.table.deletedAt),
        ),
      )
      .groupBy(campaignsInCampaign.rulesetId);
    return new Map(rows.map(({ live, rulesetId }) => [rulesetId, { live }]));
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
