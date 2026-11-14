import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter, contributorsInCharacter } from "@/drizzle/schema.ts";
import ContributionRepository from "@/server/repositories/ContributionRepository.ts";
import type { ContributorStatus } from "@/shared/enums.ts";

class CharacterContributorsRepository extends ContributionRepository<typeof contributorsInCharacter, "characterId"> {
  constructor() {
    super(contributorsInCharacter, "characterId");
  }

  /**
   * Whether an address (`pendingEmail`) holds a pending invite no sign-in claimed (the ones `backfillUserId` gives its
   * account) to a character that isn't archived: what lets it make an account on an instance that takes invites alone.
   */
  async exists(db: Db, where: { pendingEmail: string }) {
    const [row] = await db
      .select({ id: this.table.id })
      .from(this.table)
      .innerJoin(charactersInCharacter, eq(charactersInCharacter.id, this.table.characterId))
      .where(
        and(
          eq(this.table.email, where.pendingEmail),
          eq(this.table.status, "Pending"),
          isNull(this.table.userId),
          isNull(charactersInCharacter.deletedAt),
        ),
      )
      .limit(1);
    return !!row;
  }

  /**
   * The user's contributions with `status` to any of the characters (`characterIds`: one query for a list of
   * characters), or the user's rows by id, whatever their status (`ids`: their invites a page names).
   */
  async findMany(
    db: Db,
    where: { characterIds: string[]; status: ContributorStatus; userId: string } | { ids: string[]; userId: string },
  ) {
    if ("characterIds" in where && where.characterIds.length === 0) return [];
    if ("ids" in where && where.ids.length === 0) return [];
    return await db.query.contributorsInCharacter.findMany({
      where: this.branchWhere(
        [
          "characterIds" in where && inArray(this.table.characterId, where.characterIds),
          "ids" in where && inArray(this.table.id, where.ids),
        ],
        [eq(this.table.userId, where.userId), "status" in where && eq(this.table.status, where.status)],
      ),
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
