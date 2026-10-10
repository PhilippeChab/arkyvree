import { eq, type InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  type levelAbilityIncreasesInCharacter,
  type levelFeatsInCharacter,
  type levelPowersInCharacter,
  type levelSkillsInCharacter,
} from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

type LevelPickTable =
  | typeof levelAbilityIncreasesInCharacter
  | typeof levelSkillsInCharacter
  | typeof levelFeatsInCharacter
  | typeof levelPowersInCharacter;

/**
 * A level's picks (skills, feats, powers) and its ability increases: their bulk insert and their delete. What names an
 * entity, a pick among them, an in-use check finds by the list of every row naming one (`EntityReferences.exists`).
 */
abstract class LevelPicksRepository<T extends LevelPickTable> extends BaseRepository<T> {
  async createMany(db: Db, values: InferInsertModel<T>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async delete(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(eq(this.table.characterLevelId, where.characterLevelId));
  }
}

export default LevelPicksRepository;
