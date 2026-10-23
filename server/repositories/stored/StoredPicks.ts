import { and, eq, inArray, max, type SQL } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementPicksInCharacter, entitiesInRules } from "@/drizzle/schema.ts";
import { type CharacterRows, Engine, type StoredPick } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/** A pick's row, any step's, as its module's declaration reads it (a level's feat, its skill ranks). */
type PickRow = Record<string, unknown>;

/**
 * Every module's advancement picks of a step (3.5's skills, feats, spells, ability increases), as the generic tables
 * store them (`character.advancement_picks`), by their name (`pick`, `Engine.storage().character().picks`): each its
 * advancement's pick of an entity, through a pool if the step takes one, with an amount if it holds one; each row as its
 * module's declaration reads a pick (`pickRowOf`), each write as it splits one (`pickOf`). What names an entity, a pick
 * among them, an in-use check finds by the list of every row naming one (`EntityReferences.exists`).
 */
class StoredPicks extends BaseRepository<typeof advancementPicksInCharacter> {
  constructor() {
    super(advancementPicksInCharacter);
  }

  /** The columns a pick's read selects. */
  private static buildColumns() {
    return {
      advancementId: advancementPicksInCharacter.advancementId,
      amount: advancementPicksInCharacter.amount,
      createdAt: advancementPicksInCharacter.createdAt,
      entityId: advancementPicksInCharacter.entityId,
      id: advancementPicksInCharacter.id,
      updatedAt: advancementPicksInCharacter.updatedAt,
      viaId: advancementPicksInCharacter.viaId,
    };
  }

  /** The condition that picks the picks of `pick`'s step, and `where`. */
  private static buildScope(pick: string, where?: SQL): SQL {
    return and(eq(advancementPicksInCharacter.step, Engine.storage().character().picks[pick].step), where)!;
  }

  /** Stored picks as their module's rows of `pick`. */
  private static mapRows<R>(pick: string, picks: StoredPick[]): R[] {
    return picks.map((row) => Engine.storage().pickRowOf(pick, row) as R);
  }

  /** Picks by the picked entity's name, ties broken to a fixed order: a repeated pick at one level by its ordinal. */
  private pickOrder() {
    return [
      this.orderBy(entitiesInRules.name),
      this.orderBy(this.table.entityId),
      this.orderBy(this.table.viaId),
      this.orderBy(this.table.advancementId),
      this.orderBy(this.table.ordinal),
      this.orderBy(this.table.id),
    ];
  }

  /**
   * Writes picks of `pick` (`values`, each by its columns): a step that repeats (3.5's feats) numbers an entity picked
   * again at one level after its last.
   */
  async createMany<R extends object = PickRow>(db: Db, pick: string, values: PickRow[]): Promise<R[]> {
    if (values.length === 0) return [];
    const storage = Engine.storage();
    const picks = values.map((row) => storage.pickOf(pick, row));
    const key = (advancementId: string, entityId: string) => `${advancementId}:${entityId}`;
    const next = new Map<string, number>();
    if (storage.step(storage.character().picks[pick].step).repeats) {
      const last = await db
        .select({
          advancementId: this.table.advancementId,
          entityId: this.table.entityId,
          ordinal: max(this.table.ordinal),
        })
        .from(this.table)
        .where(
          StoredPicks.buildScope(
            pick,
            inArray(
              this.table.advancementId,
              picks.map((row) => row.advancementId),
            ),
          ),
        )
        .groupBy(this.table.advancementId, this.table.entityId);
      for (const row of last) next.set(key(row.advancementId, row.entityId ?? ""), (row.ordinal ?? -1) + 1);
    }
    const rows = picks.map((row) => {
      const ordinal = row.repeats ? (next.get(key(row.advancementId, row.entityId)) ?? 0) : 0;
      next.set(key(row.advancementId, row.entityId), ordinal + 1);
      return { ...row, ordinal };
    });
    return StoredPicks.mapRows<R>(pick, await db.insert(this.table).values(rows).returning(StoredPicks.buildColumns()));
  }

  /**
   * Deletes a level's picks of `pick`, or of every step its module declares picks of (its value, its hit points, is
   * its level's). Exception to soft-delete: old picks are disposable when re-finalizing a level.
   */
  async delete(db: Db, where: { characterLevelId: string; pick?: string }) {
    const picks = where.pick === undefined ? Object.keys(Engine.storage().character().picks) : [where.pick];
    const steps = picks.map((pick) => Engine.storage().character().picks[pick].step);
    return await db
      .delete(this.table)
      .where(and(eq(this.table.advancementId, where.characterLevelId), inArray(this.table.step, steps)));
  }

  /**
   * Every pick its module declares (`Engine.storage().character().picks`) of these character levels, by its name: each
   * pick's rows in `findMany`'s order, read in one query.
   */
  async findAll(db: Db, where: { characterLevelIds: string[] }): Promise<CharacterRows["picks"]> {
    const declared = Engine.storage().character().picks;
    const pickOfStep = new Map(Object.entries(declared).map(([pick, { step }]) => [step, pick]));
    const picks: CharacterRows["picks"] = Object.fromEntries(Object.keys(declared).map((pick) => [pick, []]));
    if (where.characterLevelIds.length === 0) return picks;
    const rows = await db
      .select({ ...StoredPicks.buildColumns(), step: this.table.step })
      .from(this.table)
      .leftJoin(entitiesInRules, eq(entitiesInRules.id, this.table.entityId))
      .where(
        and(
          inArray(this.table.step, [...pickOfStep.keys()]),
          inArray(this.table.advancementId, where.characterLevelIds),
        ),
      )
      .orderBy(...this.pickOrder());
    for (const { step, ...row } of rows) {
      const pick = pickOfStep.get(step)!;
      picks[pick].push(Engine.storage().pickRowOf(pick, row) as CharacterRows["picks"][string][number]);
    }
    return picks;
  }

  /**
   * The picks of `pick` of these character levels, by the picked entity's name, ties broken to a fixed order: a
   * stackable feat a level picked twice, by its ordinal.
   */
  async findMany<R extends object = PickRow>(
    db: Db,
    where: { characterLevelIds: string[]; pick: string },
  ): Promise<R[]> {
    if (where.characterLevelIds.length === 0) return [];
    const rows = await db
      .select(StoredPicks.buildColumns())
      .from(this.table)
      .leftJoin(entitiesInRules, eq(entitiesInRules.id, this.table.entityId))
      .where(StoredPicks.buildScope(where.pick, inArray(this.table.advancementId, where.characterLevelIds)))
      .orderBy(...this.pickOrder());
    return StoredPicks.mapRows<R>(where.pick, rows);
  }
}

export default StoredPicks;
