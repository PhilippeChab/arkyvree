import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { levelPowersInCharacter, powersInRules } from "@/drizzle/schema.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

class CharacterLevelPowersRepository extends LevelPicksRepository<typeof levelPowersInCharacter> {
  constructor() {
    super(levelPowersInCharacter);
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(powersInRules, eq(powersInRules.id, this.table.powerId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(powersInRules.name),
        this.orderBy(this.table.powerId),
        this.orderBy(this.table.aptitudeId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelPowersRepository;
