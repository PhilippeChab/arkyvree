import { eq, inArray, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementsInCharacter } from "@/drizzle/schema.ts";
import type { StoredAdvancement } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";

/**
 * A character's levels: its advancements (`character.advancements`), each of an entry on a track (3.5's class level, on
 * its class's), read as stored. What each picks, its value step's amount among them (3.5's hit points), is its picks'
 * (`Picks`).
 */
class CharacterAdvancementsRepository extends BaseRepository<typeof advancementsInCharacter> {
  constructor() {
    super(advancementsInCharacter);
  }

  /** The columns an advancement's read selects. */
  private static buildColumns() {
    return {
      characterId: advancementsInCharacter.characterId,
      createdAt: advancementsInCharacter.createdAt,
      entryId: advancementsInCharacter.entryId,
      id: advancementsInCharacter.id,
      position: advancementsInCharacter.position,
      updatedAt: advancementsInCharacter.updatedAt,
    };
  }

  /** The advancements a condition picks, in the order their characters took them. */
  private async rows(db: Db, where: SQL | undefined): Promise<StoredAdvancement[]> {
    return await db
      .select(CharacterAdvancementsRepository.buildColumns())
      .from(this.table)
      .where(where)
      .orderBy(this.orderBy(this.table.characterId), this.orderBy(this.table.position));
  }

  /**
   * An advancement of an entry (`entryId`) after the character's last: its position one past theirs, read in the
   * insert. Two inserts for one character read the same last position unless the first commits before the second
   * reads: a level flow locks the character first (`Characters.lock`), and the unique index refuses a second level at
   * a position.
   */
  async create(db: Db, values: { characterId: string; entryId: string }): Promise<StoredAdvancement[]> {
    const nextPosition = sql<number>`(
      SELECT coalesce(max(${this.table.position}), 0) + 1 FROM ${this.table}
      WHERE ${this.table.characterId} = ${values.characterId}
    )`;
    return await db
      .insert(this.table)
      .values({
        characterId: values.characterId,
        position: nextPosition,
        entryId: values.entryId,
        entryType: StoredCharacters.buildTypeOf(values.entryId),
      })
      .returning(CharacterAdvancementsRepository.buildColumns());
  }

  // Intentional removal — hard delete
  async delete(db: Db, where: { id: string }) {
    return await db.delete(this.table).where(eq(this.table.id, where.id));
  }

  /** The levels in the order the character took them (`position`), a character's after another's by its id. */
  async findMany(db: Db, where: { characterId: string } | { characterIds: string[] }) {
    if ("characterIds" in where && where.characterIds.length === 0) return [];
    return await this.rows(
      db,
      this.branchWhere([
        "characterId" in where && eq(this.table.characterId, where.characterId),
        "characterIds" in where && inArray(this.table.characterId, where.characterIds),
      ]),
    );
  }

  async findOne(db: Db, where: { id: string }) {
    const [row] = await this.rows(db, eq(this.table.id, where.id));
    return row;
  }

  /**
   * Marks an advancement edited (its `updatedAt`), as an edit of its picks changes it: it keeps its entry (its
   * class level). Answers it, or nothing.
   */
  async update(db: Db, where: { id: string }) {
    return await db
      .update(this.table)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, where.id))
      .returning(CharacterAdvancementsRepository.buildColumns());
  }
}

export default CharacterAdvancementsRepository;
