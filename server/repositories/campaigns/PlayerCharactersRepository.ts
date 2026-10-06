import { and, eq, inArray, isNull, not, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import {
  campaignsInCampaign,
  charactersInCharacter,
  playerCharactersInCampaign,
  playersInCampaign,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import { include } from "@/server/mixins.ts";
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
   * Returns true if the character is linked to a campaign that is itself live
   * (campaign not archived AND link not soft-removed AND owning player not
   * archived). Used by `CharactersPolicy.canHardDelete` so that a character
   * orphaned by an archived campaign isn't kept un-deletable.
   */
  /** Whether the character is linked in a campaign that isn't archived, by a player who isn't either. */
  async exists(db: Db, where: { characterId: string; campaignArchived: false }): Promise<boolean> {
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
      | { playerId: string; characterId: string }
      | { characterId: string }
      | { characterId: string; campaignId: string },
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
      search?: string;
      orderBy?: "createdAt" | "updatedAt";
      orderDir?: "asc" | "desc";
      visibilityPlayerId?: string;
    },
    pagination: { limit: number; page: number },
  ) {
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

    return this.withPagination(pagination, async ({ limit, offset }) => {
      return await db.query.playerCharactersInCampaign.findMany({
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
      });
    });
  }

  async update(
    db: Db,
    values: Partial<InferInsertModel<typeof playerCharactersInCampaign>>,
    where: { playerId: string; characterId: string },
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
