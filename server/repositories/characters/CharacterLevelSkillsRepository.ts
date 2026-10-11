import { and, eq, getTableColumns, inArray, isNull } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { levelSkillsInCharacter, skillsInRules } from "@/drizzle/schema.ts";

import LevelPicksRepository from "./LevelPicksRepository.ts";

class CharacterLevelSkillsRepository extends LevelPicksRepository<typeof levelSkillsInCharacter> {
  constructor() {
    super(levelSkillsInCharacter);
  }

  /** The picks of these character levels, by the picked entity's name, ties broken to a fixed order. */
  async findMany(db: Db, where: { characterLevelIds: string[] }) {
    if (where.characterLevelIds.length === 0) return [];
    return await db
      .select(getTableColumns(this.table))
      .from(this.table)
      .leftJoin(skillsInRules, eq(skillsInRules.id, this.table.skillId))
      .where(and(inArray(this.table.characterLevelId, where.characterLevelIds), isNull(this.table.deletedAt)))
      .orderBy(
        this.orderBy(skillsInRules.name),
        this.orderBy(this.table.skillId),
        this.orderBy(this.table.characterLevelId),
      );
  }
}

export default CharacterLevelSkillsRepository;
