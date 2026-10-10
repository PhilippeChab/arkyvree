import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import { abilitiesInRules, levelAbilityIncreasesInCharacter } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

/** A level's ability increases: each an ability its level raises, and by how much. */
class CharacterLevelAbilityIncreasesRepository extends LevelPicksRepository<typeof levelAbilityIncreasesInCharacter> {
  constructor() {
    super(levelAbilityIncreasesInCharacter);
  }

  /** The ability increases of these character levels, by the ability's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(abilitiesInRules, eq(abilitiesInRules.id, this.table.abilityId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(abilitiesInRules.name),
        this.orderBy(this.table.abilityId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelAbilityIncreasesRepository;
