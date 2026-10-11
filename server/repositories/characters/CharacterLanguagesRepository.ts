import { and, eq, type InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { languagesInCharacter } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class CharacterLanguagesRepository extends BaseRepository<typeof languagesInCharacter> {
  constructor() {
    super(languagesInCharacter);
  }

  async create(db: Db, values: InferInsertModel<typeof languagesInCharacter>) {
    return await db.insert(this.table).values(values).returning();
  }

  // Exception to soft-delete: character languages are disposable reference data
  async delete(db: Db, where: { characterId: string; languageId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.characterId, where.characterId), eq(this.table.languageId, where.languageId)));
  }

  async findMany(db: Db, where: { characterId: string }) {
    return await db.query.languagesInCharacter.findMany({
      where: eq(this.table.characterId, where.characterId),
    });
  }
}

export default CharacterLanguagesRepository;
