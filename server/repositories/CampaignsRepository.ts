import { and, count, eq, inArray, isNull, not, sql } from "drizzle-orm";

import { campaignsInCampaign, playersInCampaign, rulesetsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance, Visibility } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class CampaignsRepository extends BaseRepository<typeof campaignsInCampaign, CampaignInstance> {
  constructor() {
    super(campaignsInCampaign);
  }

  async create(db: Db, values: InferInsertModel<typeof campaignsInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof campaignsInCampaign>>,
    where: { id: string },
  ) {
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

  /** Hard delete — only callable on archived rows; gated by CampaignsPolicy.canHardDelete. */
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  async unarchive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), not(isNull(this.table.deletedAt))))
      .returning();
  }

  async findOne(db: Db, where: { id: string }, visibility: Visibility = Visibility.UnarchivedOnly) {
    return await db.query.campaignsInCampaign.findFirst({
      where: this.where([
        eq(this.table.id, where.id),
        this.visibility(visibility),
      ]),
    });
  }

  async findManyWithPlayerCount(db: Db, where: { ids: string[] }) {
    return await db
      .select({
        id: campaignsInCampaign.id,
        name: campaignsInCampaign.name,
        description: campaignsInCampaign.description,
        createdAt: campaignsInCampaign.createdAt,
        updatedAt: campaignsInCampaign.updatedAt,
        currentPlayers: count(playersInCampaign.userId).as("currentPlayers"),
      })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .where(and(
        inArray(campaignsInCampaign.id, where.ids),
        not(isNull(playersInCampaign.userId)),
        isNull(campaignsInCampaign.deletedAt),
        isNull(playersInCampaign.deletedAt),
      ))
      .groupBy(
        campaignsInCampaign.id,
        campaignsInCampaign.name,
        campaignsInCampaign.description,
        campaignsInCampaign.createdAt,
        campaignsInCampaign.updatedAt,
      )
      .orderBy(campaignsInCampaign.name);
  }

  async findOneWithPlayerCount(db: Db, where: { id: string }) {
    return await db
      .select({
        id: campaignsInCampaign.id,
        name: campaignsInCampaign.name,
        description: campaignsInCampaign.description,
        rulesetName: rulesetsInRules.name,
        deletedAt: campaignsInCampaign.deletedAt,
        createdAt: campaignsInCampaign.createdAt,
        updatedAt: campaignsInCampaign.updatedAt,
        currentPlayers: count(playersInCampaign.userId).as("currentPlayers"),
      })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .innerJoin(rulesetsInRules, eq(campaignsInCampaign.rulesetId, rulesetsInRules.id))
      .where(and(
        eq(campaignsInCampaign.id, where.id),
        not(isNull(playersInCampaign.userId)),
      ))
      .groupBy(
        campaignsInCampaign.id,
        campaignsInCampaign.name,
        campaignsInCampaign.description,
        rulesetsInRules.name,
        campaignsInCampaign.deletedAt,
        campaignsInCampaign.createdAt,
        campaignsInCampaign.updatedAt,
      );
  }

  async findMany(
    db: Db,
    where: {
      userId: string;
      visibility?: Visibility;
      search?: string;
      orderBy?: "name" | "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    const { visibility = Visibility.UnarchivedOnly, search, orderBy = "createdAt", orderDir = "desc" } = where;
    const { limit, offset } = this.paginate(pagination);

    const searchCondition = this.search(search, [this.table.name, this.table.description]);

    const playerCountSubquery = db
      .select({ campaignId: playersInCampaign.campaignId, count: count().as("count") })
      .from(playersInCampaign)
      .where(and(not(isNull(playersInCampaign.userId)), isNull(playersInCampaign.deletedAt)))
      .groupBy(playersInCampaign.campaignId)
      .as("playerCount");

    const rows = await db
      .select({
        id: campaignsInCampaign.id,
        name: campaignsInCampaign.name,
        description: campaignsInCampaign.description,
        rulesetName: rulesetsInRules.name,
        createdAt: campaignsInCampaign.createdAt,
        updatedAt: campaignsInCampaign.updatedAt,
        currentPlayers: sql<number>`coalesce(${playerCountSubquery.count}, 0)::int`.as("currentPlayers"),
      })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .innerJoin(rulesetsInRules, eq(campaignsInCampaign.rulesetId, rulesetsInRules.id))
      .leftJoin(playerCountSubquery, eq(campaignsInCampaign.id, playerCountSubquery.campaignId))
      .where(this.where([
        eq(playersInCampaign.userId, where.userId),
        this.visibility(visibility),
        searchCondition,
      ]))
      .groupBy(
        campaignsInCampaign.id,
        campaignsInCampaign.name,
        campaignsInCampaign.description,
        rulesetsInRules.name,
        campaignsInCampaign.createdAt,
        campaignsInCampaign.updatedAt,
        playerCountSubquery.count,
      )
      .orderBy(this.orderBy(this.table[orderBy], orderDir))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  async count(db: Db, where: { userId: string }) {
    const [result] = await db
      .select({ count: count() })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .where(and(
        eq(playersInCampaign.userId, where.userId),
        isNull(campaignsInCampaign.deletedAt),
        isNull(playersInCampaign.deletedAt),
      ));

    return result.count;
  }

  withInstance(instance: InferSelectModel<typeof campaignsInCampaign>) {
    return new CampaignInstance(instance);
  }
}

class CampaignInstance extends Instance<InferSelectModel<typeof campaignsInCampaign>> {}

export default CampaignsRepository;
