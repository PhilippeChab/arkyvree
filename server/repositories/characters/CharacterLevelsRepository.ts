import { and, eq, inArray, type InferInsertModel, isNull, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { levelsInCharacter } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class CharacterLevelsRepository extends BaseRepository<typeof levelsInCharacter> {
  constructor() {
    super(levelsInCharacter);
  }

  /**
   * A level after the character's last: its position one past theirs, read in the insert. Two inserts for one
   * character read the same last position unless the first commits before the second reads: a level flow locks the
   * character first (`Characters.lock`), and the unique index refuses a second level at a position.
   */
  async create(db: Db, values: Omit<InferInsertModel<typeof levelsInCharacter>, "position">) {
    const nextPosition = sql<number>`(
      SELECT coalesce(max(${this.table.position}), 0) + 1 FROM ${this.table}
      WHERE ${this.table.characterId} = ${values.characterId} AND ${this.table.deletedAt} IS NULL
    )`;
    return await db
      .insert(this.table)
      .values({ ...values, position: nextPosition })
      .returning();
  }

  // Intentional removal — hard delete
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  /** The levels in the order the character took them (`position`), a character's after another's by its id. */
  async findMany(db: Db, where: { characterId: string } | { characterIds: string[] }) {
    if ("characterIds" in where && where.characterIds.length === 0) return [];
    return await db.query.levelsInCharacter.findMany({
      where: this.branchWhere(
        [
          "characterId" in where && eq(this.table.characterId, where.characterId),
          "characterIds" in where && inArray(this.table.characterId, where.characterIds),
        ],
        [isNull(this.table.deletedAt)],
      ),
      orderBy: [this.orderBy(this.table.characterId), this.orderBy(this.table.position)],
    });
  }

  async findOne(db: Db, where: { id: string } | { characterId: string; klassLevelId: string }) {
    return await db.query.levelsInCharacter.findFirst({
      where: this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "characterId" in where && eq(this.table.characterId, where.characterId),
        ],
        ["klassLevelId" in where && eq(this.table.klassLevelId, where.klassLevelId), isNull(this.table.deletedAt)],
      ),
    });
  }

  async update(db: Db, values: Partial<InferInsertModel<typeof levelsInCharacter>>, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning();
  }
}

export default CharacterLevelsRepository;
