import { and, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementPicksInCharacter, advancementsInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import StoredCharacters from "@/server/repositories/stored/StoredCharacters.ts";
import { toQualified } from "@/server/repositories/stored/toQualified.ts";
import type { CharacterLevel } from "@/shared/relations.ts";

/**
 * A character's levels: its advancements (`character.advancements`), each in a track (its class level), and the value
 * its module's value step holds of it (`advancement.value`: 3.5's hit points, its `hp` pick).
 */
class CharacterLevelsRepository extends BaseRepository<typeof advancementsInCharacter> {
  constructor() {
    super(advancementsInCharacter);
  }

  /** A level's columns: its advancement's, its track under the module's name, and its value step's amount. */
  private columns() {
    const { track, value } = Engine.storage().character().advancement;
    return {
      id: advancementsInCharacter.id,
      characterId: advancementsInCharacter.characterId,
      [track]: advancementsInCharacter.trackId,
      [value.column]: sql<number>`(SELECT ${advancementPicksInCharacter.amount} FROM ${advancementPicksInCharacter} WHERE ${advancementPicksInCharacter.advancementId} = ${toQualified(advancementsInCharacter.id)} AND ${advancementPicksInCharacter.step} = ${value.step})`,
      position: advancementsInCharacter.position,
      createdAt: advancementsInCharacter.createdAt,
      updatedAt: advancementsInCharacter.updatedAt,
      deletedAt: advancementsInCharacter.deletedAt,
    };
  }

  /** The levels a condition picks, in the order their characters took them. */
  private async rows(db: Db, where: SQL | undefined): Promise<CharacterLevel[]> {
    const rows = await db
      .select(this.columns())
      .from(this.table)
      .where(where)
      .orderBy(this.orderBy(this.table.characterId), this.orderBy(this.table.position));
    return rows as unknown as CharacterLevel[];
  }

  /** Writes a level's value (its hit points), replacing the one it held. */
  private async writeValue(db: Db, advancementId: string, amount: number) {
    const { step } = Engine.storage().character().advancement.value;
    await db
      .delete(advancementPicksInCharacter)
      .where(
        and(eq(advancementPicksInCharacter.advancementId, advancementId), eq(advancementPicksInCharacter.step, step)),
      );
    await db.insert(advancementPicksInCharacter).values({
      advancementId,
      step,
      amount,
      repeats: Engine.storage().step(step).repeats,
    });
  }

  /**
   * A level after the character's last: its position one past theirs, read in the insert. Two inserts for one
   * character read the same last position unless the first commits before the second reads: a level flow locks the
   * character first (`Characters.lock`), and the unique index refuses a second level at a position.
   */
  async create(db: Db, values: { characterId: string; hp: number; id?: string; klassLevelId: string }) {
    const nextPosition = sql<number>`(
      SELECT coalesce(max(${this.table.position}), 0) + 1 FROM ${this.table}
      WHERE ${this.table.characterId} = ${values.characterId} AND ${this.table.deletedAt} IS NULL
    )`;
    const [created] = await db
      .insert(this.table)
      .values({
        id: values.id,
        characterId: values.characterId,
        position: nextPosition,
        trackId: values.klassLevelId,
        trackType: StoredCharacters.buildTypeOf(values.klassLevelId),
      })
      .returning({ id: this.table.id });
    await this.writeValue(db, created.id, values.hp);
    return await this.rows(db, eq(this.table.id, created.id));
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
      this.branchWhere(
        [
          "characterId" in where && eq(this.table.characterId, where.characterId),
          "characterIds" in where && inArray(this.table.characterId, where.characterIds),
        ],
        [isNull(this.table.deletedAt)],
      ),
    );
  }

  async findOne(db: Db, where: { id: string } | { characterId: string; klassLevelId: string }) {
    const [row] = await this.rows(
      db,
      this.branchWhere(
        [
          "id" in where && eq(this.table.id, where.id),
          "characterId" in where && eq(this.table.characterId, where.characterId),
        ],
        ["klassLevelId" in where && eq(this.table.trackId, where.klassLevelId), isNull(this.table.deletedAt)],
      ),
    );
    return row;
  }

  /** Writes a change to a live level: its class level, its hit points. */
  async update(db: Db, values: { hp?: number; klassLevelId?: string }, where: { id: string }) {
    const updated = await db
      .update(this.table)
      .set({
        ...(values.klassLevelId
          ? { trackId: values.klassLevelId, trackType: StoredCharacters.buildTypeOf(values.klassLevelId) }
          : {}),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(this.table.id, where.id), isNull(this.table.deletedAt)))
      .returning({ id: this.table.id });
    if (updated.length === 0) return [];
    if (values.hp !== undefined) await this.writeValue(db, where.id, values.hp);
    return await this.rows(db, eq(this.table.id, where.id));
  }
}

export default CharacterLevelsRepository;
