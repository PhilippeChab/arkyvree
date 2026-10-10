import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { featsInRules, levelFeatsInCharacter } from "@/drizzle/schema.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

class CharacterLevelFeatsRepository extends LevelPicksRepository<typeof levelFeatsInCharacter> {
  constructor() {
    super(levelFeatsInCharacter);
  }

  /**
   * The picks of these character levels, by the picked entity's name, ties broken to a fixed order: a stackable feat a
   * level picked twice, by its rows' own ids.
   */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(featsInRules, eq(featsInRules.id, this.table.featId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(featsInRules.name),
        this.orderBy(this.table.featId),
        this.orderBy(this.table.aptitudeId),
        this.orderBy(this.table.characterLevelId),
        this.orderBy(this.table.id),
      );
  }
}

export default CharacterLevelFeatsRepository;
