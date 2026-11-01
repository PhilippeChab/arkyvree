import { and, count, countDistinct, eq, inArray, type InferInsertModel, isNull, not, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { campaignsInCampaign, playersInCampaign, rulesetsInRules } from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository, { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

/**
 * The filters of the user's campaigns list: those they hold a seat in, live unless `visibility` says otherwise,
 * matching `search`.
 */
interface CampaignListWhere {
  search?: string;
  userId: string;
  visibility?: Visibility;
}

class CampaignsRepository extends include(BaseRepository<typeof campaignsInCampaign>, Paginates, Searches) {
  constructor() {
    super(campaignsInCampaign);
  }

  /** What the user's campaigns list keeps, over the campaigns joined to their seats: its pages and total share it. */
  private listCondition(where: CampaignListWhere) {
    const { search, userId, visibility = Visibility.UnarchivedOnly } = where;
    return this.where([
      eq(playersInCampaign.userId, userId),
      this.visibility(visibility),
      this.search(search, [this.table.name, this.table.description]),
    ]);
  }

  async archive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }

  /** How many campaigns the user's list holds with these filters: the total of its pages (`findPage`). */
  async count(db: Db, where: CampaignListWhere) {
    const [result] = await db
      .select({ count: countDistinct(campaignsInCampaign.id) })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .where(this.listCondition(where));
    return result.count;
  }

  async create(db: Db, values: InferInsertModel<typeof campaignsInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  /** Hard delete — only callable on archived rows; gated by CampaignsPolicy.canHardDelete. */
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  async findOne(db: Db, where: { id: string }, visibility: Visibility = Visibility.UnarchivedOnly) {
    return await db.query.campaignsInCampaign.findFirst({
      where: this.where([eq(this.table.id, where.id), this.visibility(visibility)]),
    });
  }

  async findOneWithPlayerCount(db: Db, where: { id: string }) {
    return await db
      .select({
        id: campaignsInCampaign.id,
        name: campaignsInCampaign.name,
        description: campaignsInCampaign.description,
        rulesetId: campaignsInCampaign.rulesetId,
        rulesetName: rulesetsInRules.name,
        deletedAt: campaignsInCampaign.deletedAt,
        createdAt: campaignsInCampaign.createdAt,
        updatedAt: campaignsInCampaign.updatedAt,
        // Its live players, as a page of campaigns counts them: an archived slot is none
        currentPlayers:
          sql<number>`(count(${playersInCampaign.userId}) filter (where ${playersInCampaign.deletedAt} is null))::int`.as(
            "currentPlayers",
          ),
      })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .innerJoin(rulesetsInRules, eq(campaignsInCampaign.rulesetId, rulesetsInRules.id))
      .where(and(eq(campaignsInCampaign.id, where.id), not(isNull(playersInCampaign.userId))))
      .groupBy(
        campaignsInCampaign.id,
        campaignsInCampaign.name,
        campaignsInCampaign.description,
        campaignsInCampaign.rulesetId,
        rulesetsInRules.name,
        campaignsInCampaign.deletedAt,
        campaignsInCampaign.createdAt,
        campaignsInCampaign.updatedAt,
      );
  }

  async findPage(
    db: Db,
    where: CampaignListWhere & { orderBy?: "name" | "createdAt" | "updatedAt"; orderDir?: "asc" | "desc" },
    pagination: Pagination,
  ) {
    const { orderBy = "createdAt", orderDir = "desc" } = where;
    const { limit, offset } = this.paginate(pagination);

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
        rulesetId: campaignsInCampaign.rulesetId,
        rulesetName: rulesetsInRules.name,
        createdAt: campaignsInCampaign.createdAt,
        updatedAt: campaignsInCampaign.updatedAt,
        deletedAt: campaignsInCampaign.deletedAt,
        currentPlayers: sql<number>`coalesce(${playerCountSubquery.count}, 0)::int`.as("currentPlayers"),
      })
      .from(campaignsInCampaign)
      .innerJoin(playersInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .innerJoin(rulesetsInRules, eq(campaignsInCampaign.rulesetId, rulesetsInRules.id))
      .leftJoin(playerCountSubquery, eq(campaignsInCampaign.id, playerCountSubquery.campaignId))
      .where(this.listCondition(where))
      .groupBy(
        campaignsInCampaign.id,
        campaignsInCampaign.name,
        campaignsInCampaign.description,
        campaignsInCampaign.rulesetId,
        rulesetsInRules.name,
        campaignsInCampaign.createdAt,
        campaignsInCampaign.updatedAt,
        campaignsInCampaign.deletedAt,
        playerCountSubquery.count,
      )
      .orderBy(...this.pageOrder(this.orderBy(this.table[orderBy], orderDir)))
      .limit(limit)
      .offset(offset);

    return this.paginated(rows, pagination);
  }

  /**
   * Locks the campaigns a user holds a live seat in (`userId`) until the transaction ends, by id: an account's
   * deletion, which archives its seats, waits on their campaigns' writes, after its rulesets and before its characters,
   * as every write that locks several takes them, and never on one in a cycle.
   */
  async lockMany(db: Db, where: { userId: string }) {
    const seats = db
      .select({ campaignId: playersInCampaign.campaignId })
      .from(playersInCampaign)
      .where(and(eq(playersInCampaign.userId, where.userId), isNull(playersInCampaign.deletedAt)));
    await db
      .select({ id: this.table.id })
      .from(this.table)
      .where(inArray(this.table.id, seats))
      .orderBy(this.table.id)
      .for("no key update");
  }

  async unarchive(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), not(isNull(this.table.deletedAt))))
      .returning();
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof campaignsInCampaign>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default CampaignsRepository;
