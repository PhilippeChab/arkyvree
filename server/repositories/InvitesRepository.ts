import type { InferInsertModel } from "drizzle-orm";
import { and, desc, eq, getTableColumns, ilike, inArray, isNull, or } from "drizzle-orm";

import { invitesInCampaign, playersInCampaign, usersInAccount } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class InvitesRepository extends BaseRepository<typeof invitesInCampaign> {
  constructor() {
    super(invitesInCampaign);
  }

  async create(db: Db, values: { email: string; userId?: string; playerId: string }) {
    return await db
      .insert(this.table)
      .values({ email: values.email, userId: values.userId, playerId: values.playerId })
      .returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof invitesInCampaign>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async deleteByPlayerId(db: Db, where: { playerId: string }) {
    return await db.delete(this.table).where(eq(this.table.playerId, where.playerId)).returning();
  }

  async archiveAllForUser(db: Db, where: { userId: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, where.userId), isNull(this.table.deletedAt)))
      .returning();
  }

  async findOne(
    db: Db,
    where:
      | { id: string }
      | { playerId: string; status: string }
      | { userId: string; playerIds: string[]; status: string }
      | { email: string; playerIds: string[]; status: string },
  ) {
    return await db.query.invitesInCampaign.findFirst({
      where: this.where([
        "id" in where && eq(this.table.id, where.id),
        "userId" in where && eq(this.table.userId, where.userId),
        "email" in where && eq(this.table.email, where.email),
        "playerId" in where && eq(this.table.playerId, where.playerId),
        "playerIds" in where && inArray(this.table.playerId, where.playerIds),
        "status" in where && eq(this.table.status, where.status),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  async findMany(
    db: Db,
    where: { userId: string } | { playerId: string },
    pagination: { limit: number } = { limit: 100 },
    include?: { campaign: boolean },
  ) {
    return await db.query.invitesInCampaign.findMany({
      where: this.where([
        "userId" in where && eq(this.table.userId, where.userId),
        "playerId" in where && eq(this.table.playerId, where.playerId),
        isNull(this.table.deletedAt),
      ]),
      with: include?.campaign
        ? {
            playersInCampaign: {
              with: {
                campaignsInCampaign: true,
              },
            },
          }
        : undefined,
      orderBy: [desc(this.table.createdAt)],
      limit: pagination.limit,
    });
  }

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneForUser(db: Db, where: { id: string; userId: string }) {
    return await db.query.invitesInCampaign.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        eq(this.table.userId, where.userId),
        isNull(this.table.deletedAt),
      ]),
      with: {
        playersInCampaign: {
          with: {
            campaignsInCampaign: true,
          },
        },
      },
    });
  }

  async findManyForCampaign(
    db: Db,
    where: { campaignId: string; search?: string; orderBy?: "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;
    const { limit, offset } = this.paginate(pagination);

    const searchCondition = search
      ? or(
          ilike(this.table.email, `%${search}%`),
          ilike(usersInAccount.username, `%${search}%`),
          ilike(usersInAccount.emailAddress, `%${search}%`),
        )!
      : false;

    // The invitee's public fields only: a whole users row carries its password digest.
    const rows = await db
      .select({
        invites: getTableColumns(this.table),
        players: getTableColumns(playersInCampaign),
        users: { id: usersInAccount.id, username: usersInAccount.username, emailAddress: usersInAccount.emailAddress },
      })
      .from(this.table)
      .innerJoin(playersInCampaign, eq(this.table.playerId, playersInCampaign.id))
      .leftJoin(usersInAccount, eq(this.table.userId, usersInAccount.id))
      .where(
        this.where([
          eq(playersInCampaign.campaignId, where.campaignId),
          isNull(playersInCampaign.deletedAt),
          isNull(this.table.deletedAt),
          searchCondition,
        ]),
      )
      .orderBy(this.orderBy(this.table[orderBy], orderDir))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async backfillUserId(db: Db, email: string, userId: string) {
    return await db
      .update(this.table)
      .set({ userId, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.email, email),
          eq(this.table.status, "Pending"),
          isNull(this.table.userId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }
}

export default InvitesRepository;
