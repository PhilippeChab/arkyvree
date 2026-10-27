import { eq, inArray } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { contributorsInCharacter } from "@/drizzle/schema.ts";
import ContributionRepository from "@/server/repositories/ContributionRepository.ts";
import type { ContributorStatus } from "@/shared/enums.ts";

class CharacterContributorsRepository extends ContributionRepository<typeof contributorsInCharacter, "characterId"> {
  constructor() {
    super(contributorsInCharacter, "characterId");
  }

  /** The user's contributions with `status` to any of the characters: one query for a list of characters. */
  async findMany(db: Db, where: { characterIds: string[]; status: ContributorStatus; userId: string }) {
    if (where.characterIds.length === 0) return [];
    return await db.query.contributorsInCharacter.findMany({
      where: this.where([
        inArray(this.table.characterId, where.characterIds),
        eq(this.table.userId, where.userId),
        eq(this.table.status, where.status),
      ]),
    });
  }

  // Single invite for a specific user, any status. Caller is responsible for
  // scoping by userId so a stranger can't probe other people's invite ids.
  async findOneWithCharacter(db: Db, where: { id: string; userId: string }) {
    return await db.query.contributorsInCharacter.findFirst({
      where: this.where([eq(this.table.id, where.id), eq(this.table.userId, where.userId)]),
      with: {
        charactersInCharacter: {
          columns: { id: true, name: true, deletedAt: true },
        },
      },
    });
  }
}

export default CharacterContributorsRepository;
