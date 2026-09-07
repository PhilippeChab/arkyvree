import { and, eq, exists, isNull, not } from "drizzle-orm";

import { playersInCampaign, usersInAccount } from "@/drizzle/schema.ts";
import BaseRepository, { Instance, Visibility } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class PlayersRepository extends BaseRepository<typeof playersInCampaign, PlayerInstance> {
  constructor() {
    super(playersInCampaign);
  }

  async create(db: Db, values: InferInsertModel<typeof playersInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof playersInCampaign>>,
    where: { id: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  async archive(db: Db, where: { id: string } | { campaignId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(this.where([
        "id" in where && eq(this.table.id, where.id),
        "campaignId" in where && eq(this.table.campaignId, where.campaignId),
        isNull(this.table.deletedAt),
      ]))
      .returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async delete(db: Db, where: { id: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.id, where.id));
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async unarchive(db: Db, where: { campaignId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.campaignId, where.campaignId), not(isNull(this.table.deletedAt))))
      .returning();
  }

  async findOne(
    db: Db,
    where: { id: string } | { id: string; campaignId: string } | { userId: string; campaignId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.playersInCampaign.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "campaignId" in where && eq(this.table.campaignId, where.campaignId),
        "userId" in where && eq(this.table.userId, where.userId),
        this.visibility(visibility),
      ]),
    });
  }

  async findMany(
    db: Db,
    where: { campaignId: string } | { userId: string },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    return await db.query.playersInCampaign.findMany({
      where: this.where([
        "campaignId" in where && eq(this.table.campaignId, where.campaignId),
        "userId" in where && eq(this.table.userId, where.userId),
        this.visibility(visibility),
      ]),
    });
  }

  async findManyForCampaign(
    db: Db,
    where: { campaignId: string; search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
    visibility: Visibility = Visibility.UnarchivedOnly,
  ) {
    const { search, orderBy = "createdAt", orderDir = "asc" } = where;
    const searchCondition = search
      ? exists(
        db.select({ id: usersInAccount.id })
          .from(usersInAccount)
          .where(and(
            eq(usersInAccount.id, this.table.userId),
            this.search(search, [usersInAccount.username, usersInAccount.emailAddress]) || undefined,
          )),
      )
      : false;

    return await this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.playersInCampaign.findMany({
        where: this.where([
          eq(this.table.campaignId, where.campaignId),
          this.visibility(visibility),
          searchCondition,
        ]),
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
            orderBy: (invites, { desc }) => [desc(invites.createdAt)],
            limit: 1, // latest invite
          },
        },
        orderBy: this.orderBy(this.table[orderBy], orderDir),
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof playersInCampaign>) {
    return new PlayerInstance(instance);
  }
}

class PlayerInstance extends Instance<InferSelectModel<typeof playersInCampaign>> {}

export default PlayersRepository;
