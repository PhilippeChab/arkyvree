import { and, eq, exists, isNull, inArray, not, or } from "drizzle-orm";

import { campaignsInCampaign, charactersInCharacter, playerCharactersInCampaign, playersInCampaign } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class PlayerCharactersRepository
  extends BaseRepository<typeof playerCharactersInCampaign, PlayerCharacterInstance> {
  constructor() {
    super(playerCharactersInCampaign);
  }

  async create(db: Db, values: InferInsertModel<typeof playerCharactersInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof playerCharactersInCampaign>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof playerCharactersInCampaign>>,
    where: { playerId: string; characterId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(
        eq(this.table.playerId, where.playerId),
        eq(this.table.characterId, where.characterId),
        isNull(this.table.deletedAt),
      ))
      .returning();
  }

  async archive(db: Db, where: { playerId: string; characterId?: string } | { playerIds: string[] }) {
    if ("playerIds" in where) {
      if (where.playerIds.length === 0) return [];

      return await db
        .update(this.table)
        .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(and(inArray(this.table.playerId, where.playerIds), isNull(this.table.deletedAt)))
        .returning();
    }

    const conditions = [
      eq(this.table.playerId, where.playerId),
      isNull(this.table.deletedAt),
    ];

    if (where.characterId) {
      conditions.push(eq(this.table.characterId, where.characterId));
    }

    return await db
      .update(this.table)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(...conditions))
      .returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async deleteByPlayerId(db: Db, where: { playerId: string }) {
    return await db
      .delete(this.table)
      .where(eq(this.table.playerId, where.playerId));
  }

  async unarchive(db: Db, where: { playerIds: string[] }) {
    if (where.playerIds.length === 0) return [];

    return await db
      .update(this.table)
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(and(inArray(this.table.playerId, where.playerIds), not(isNull(this.table.deletedAt))))
      .returning();
  }

  async findOne(
    db: Db,
    where: { playerId: string; characterId: string } | { characterId: string },
  ) {
    return await db.query.playerCharactersInCampaign.findFirst({
      where: this.where([
        "playerId" in where && eq(this.table.playerId, where.playerId),
        "characterId" in where && eq(this.table.characterId, where.characterId),
        isNull(this.table.deletedAt),
      ]),
    });
  }

  /**
   * Returns true if the character is linked to a campaign that is itself live
   * (campaign not archived AND link not soft-removed AND owning player not
   * archived). Used by `CharactersPolicy.canHardDelete` so that a character
   * orphaned by an archived campaign isn't kept un-deletable.
   */
  async existsInActiveCampaign(db: Db, where: { characterId: string }): Promise<boolean> {
    const rows = await db
      .select({ id: this.table.characterId })
      .from(this.table)
      .innerJoin(playersInCampaign, eq(playersInCampaign.id, this.table.playerId))
      .innerJoin(campaignsInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .where(and(
        eq(this.table.characterId, where.characterId),
        isNull(this.table.deletedAt),
        isNull(playersInCampaign.deletedAt),
        isNull(campaignsInCampaign.deletedAt),
      ))
      .limit(1);
    return rows.length > 0;
  }

  async findMany(
    db: Db,
    where: ({ playerId: string } | { characterId: string } | { playerIds: string[] }) & {
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      visibilityPlayerId?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;
    const searchCondition = search
      ? exists(
        db.select({ id: charactersInCharacter.id })
          .from(charactersInCharacter)
          .where(and(
            eq(charactersInCharacter.id, this.table.characterId),
            this.search(search, [charactersInCharacter.name, charactersInCharacter.description]) || undefined,
          )),
      )
      : false;

    // When visibilityPlayerId is set, only return Private chars for that player
    const visibilityCondition = where.visibilityPlayerId
      ? or(
        eq(this.table.playerId, where.visibilityPlayerId),
        not(eq(this.table.visibility, "Private")),
      )!
      : false;

    return this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.playerCharactersInCampaign.findMany({
        where: this.where([
          "playerIds" in where && inArray(playerCharactersInCampaign.playerId, where.playerIds),
          "playerId" in where && eq(this.table.playerId, where.playerId),
          "characterId" in where && eq(this.table.characterId, where.characterId),
          isNull(this.table.deletedAt),
          searchCondition,
          visibilityCondition,
        ]),
        with: {
          charactersInCharacter: true,
        },
        orderBy: this.orderBy(this.table[orderBy], orderDir),
        limit,
        offset,
      });
    });
  }

  withInstance(instance: InferSelectModel<typeof playerCharactersInCampaign>) {
    return new PlayerCharacterInstance(instance);
  }
}

class PlayerCharacterInstance
  extends Instance<InferSelectModel<typeof playerCharactersInCampaign>> {}

export default PlayerCharactersRepository;
