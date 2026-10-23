import { and, eq } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { linksInCharacter } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import StoredCharacterLinks from "@/server/repositories/stored/StoredCharacterLinks.ts";
import type { CharacterLanguage } from "@/shared/relations.ts";

/** The languages a character speaks: its links to them. */
class CharacterLanguagesRepository extends BaseRepository<typeof linksInCharacter> {
  constructor() {
    super(linksInCharacter);
  }

  async create(db: Db, values: { characterId: string; languageId: string }) {
    return await this.createMany(db, [values]);
  }

  async createMany(db: Db, values: { characterId: string; languageId: string }[]) {
    if (values.length === 0) return [];
    const rows = await db
      .insert(this.table)
      .values(values.map((row) => StoredCharacterLinks.values("languages", row)))
      .returning(StoredCharacterLinks.columns("languages"));
    return rows as unknown as CharacterLanguage[];
  }

  // Exception to soft-delete: character languages are disposable reference data
  async delete(db: Db, where: { characterId: string; languageId: string }) {
    return await db
      .delete(this.table)
      .where(
        StoredCharacterLinks.scope(
          "languages",
          and(eq(this.table.characterId, where.characterId), eq(this.table.entityId, where.languageId)),
        ),
      );
  }

  async findMany(db: Db, where: { characterId: string }) {
    const rows = await db
      .select(StoredCharacterLinks.columns("languages"))
      .from(this.table)
      .where(StoredCharacterLinks.scope("languages", eq(this.table.characterId, where.characterId)))
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
    return rows as unknown as CharacterLanguage[];
  }
}

export default CharacterLanguagesRepository;
