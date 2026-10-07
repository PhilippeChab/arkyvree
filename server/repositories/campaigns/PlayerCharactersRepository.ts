import { and, eq, inArray, type InferInsertModel, isNull, not, or } from "drizzle-orm";

import {
  campaignsInCampaign,
  charactersInCharacter,
  playerCharactersInCampaign,
  playersInCampaign,
} from "@/drizzle/schema.ts";
import { include } from "@/lib/mixins.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";

class PlayerCharactersRepository extends include(
  BaseRepository<typeof playerCharactersInCampaign>,
  Paginates,
  Searches,
) {
  constructor() {
    super(playerCharactersInCampaign);
  }

  async create(db: Db, values: InferInsertModel<typeof playerCharactersInCampaign>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Hard delete — used when intentionally removing a player from a campaign
  async delete(db: Db, where: { playerId: string }) {
    return await db.delete(this.table).where(eq(this.table.playerId, where.playerId));
  }

  /**
   * Whether the character is linked in a live campaign: the campaign not archived, the link not removed, its player not
   * archived. `CharactersPolicy.canHardDelete` reads it, so a character an archived campaign orphaned can be deleted.
   */
  async exists(db: Db, where: { campaignArchived: false; characterId: string }): Promise<boolean> {
    const rows = await db
      .select({ id: this.table.characterId })
      .from(this.table)
      .innerJoin(playersInCampaign, eq(playersInCampaign.id, this.table.playerId))
      .innerJoin(campaignsInCampaign, eq(campaignsInCampaign.id, playersInCampaign.campaignId))
      .where(
        and(
          eq(this.table.characterId, where.characterId),
          isNull(this.table.deletedAt),
          isNull(playersInCampaign.deletedAt),
          isNull(campaignsInCampaign.deletedAt),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async findOne(
    db: Db,
    where:
      | { characterId: string; playerId: string }
      | { characterId: string }
      | { campaignId: string; characterId: string },
  ) {
    return await db.query.playerCharactersInCampaign.findFirst({
      where: this.branchWhere(
        [
          "playerId" in where && eq(this.table.playerId, where.playerId),
          "characterId" in where && eq(this.table.characterId, where.characterId),
        ],
        [
          "campaignId" in where &&
            inArray(
              this.table.playerId,
              db
                .select({ id: playersInCampaign.id })
                .from(playersInCampaign)
                .where(and(eq(playersInCampaign.campaignId, where.campaignId), isNull(playersInCampaign.deletedAt))),
            ),
          isNull(this.table.deletedAt),
        ],
      ),
    });
  }

  async findPage(
    db: Db,
    where: ({ playerId: string } | { characterId: string } | { playerIds: string[] }) & {
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      search?: string;
      visibilityPlayerId?: string;
    },
    pagination: { limit: number; page: number },
  ) {
    if ("playerIds" in where && where.playerIds.length === 0) return this.paginated([], pagination);
    const { search, orderBy = "createdAt", orderDir = "desc" } = where;
    // Not correlated: the relational query aliases the table, which a subquery
    // referencing `this.table` would miss.
    const searchCondition = search
      ? inArray(
          this.table.characterId,
          db
            .select({ id: charactersInCharacter.id })
            .from(charactersInCharacter)
            .where(this.search(search, [charactersInCharacter.name, charactersInCharacter.description]) || undefined),
        )
      : false;

    // When visibilityPlayerId is set, only return Private chars for that player
    const visibilityCondition = where.visibilityPlayerId
      ? or(eq(this.table.playerId, where.visibilityPlayerId), not(eq(this.table.visibility, "Private")))!
      : false;

    return this.withPagination(
      pagination,
      async ({ limit, offset }) =>
        await db.query.playerCharactersInCampaign.findMany({
          where: this.branchWhere(
            [
              "playerIds" in where && inArray(playerCharactersInCampaign.playerId, where.playerIds),
              "playerId" in where && eq(this.table.playerId, where.playerId),
              "characterId" in where && eq(this.table.characterId, where.characterId),
            ],
            [isNull(this.table.deletedAt), searchCondition, visibilityCondition],
          ),
          with: {
            charactersInCharacter: true,
          },
          // A link has no id: a character is linked to one campaign at a time
          orderBy: this.pageOrder(this.orderBy(this.table[orderBy], orderDir), this.table.characterId),
          limit,
          offset,
        }),
    );
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof playerCharactersInCampaign>>,
    where: { characterId: string; playerId: string },
  ) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(this.table.playerId, where.playerId),
          eq(this.table.characterId, where.characterId),
          isNull(this.table.deletedAt),
        ),
      )
      .returning();
  }
}

export default PlayerCharactersRepository;
