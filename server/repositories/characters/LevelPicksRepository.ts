import { and, eq, inArray, max, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementPicksInCharacter, entitiesInRules } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/**
 * A level's picks of a step (`pick`: its skills, its feats, its spells, its ability increases), as its module declares
 * them (`Engine.storage().character().picks[pick]`): each its advancement's pick of an entity, through a pool if the
 * step takes one, with an amount if it holds one. What names an entity, a pick among them, an in-use check finds by the
 * list of every row naming one (`EntityReferences.exists`).
 */
abstract class LevelPicksRepository<R> extends BaseRepository<typeof advancementPicksInCharacter> {
  constructor() {
    super(advancementPicksInCharacter);
  }

  protected abstract readonly pick: string;

  /** A pick's row columns: its level, its entity, its pool and its amount by their names, its id if it names it. */
  private columns() {
    const pick = this.declared();
    return {
      ...(pick.id ? { id: advancementPicksInCharacter.id } : {}),
      characterLevelId: advancementPicksInCharacter.advancementId,
      [pick.entity]: advancementPicksInCharacter.entityId,
      ...(pick.via ? { [pick.via]: advancementPicksInCharacter.viaId } : {}),
      ...(pick.amount ? { [pick.amount]: advancementPicksInCharacter.amount } : {}),
      createdAt: advancementPicksInCharacter.createdAt,
      updatedAt: advancementPicksInCharacter.updatedAt,
      deletedAt: sql<string | null>`NULL::timestamptz`,
    };
  }

  /** The step's declaration: its step, and its pick's columns. */
  private declared() {
    return Engine.storage().character().picks[this.pick];
  }

  /** The condition that picks the step's picks, and `where`. */
  private scope(where?: SQL) {
    return and(eq(advancementPicksInCharacter.step, this.declared().step), where)!;
  }

  /**
   * Writes picks (`values`, each by its columns), each of its step's entity type and its pool's: a step that repeats
   * (3.5's feats) numbers an entity picked again at one level after its last.
   */
  async createMany(db: Db, values: Record<string, unknown>[]) {
    if (values.length === 0) return [];
    const pick = this.declared();
    const step = Engine.storage().step(pick.step);
    const key = (advancementId: string, entityId: string) => `${advancementId}:${entityId}`;
    const next = new Map<string, number>();
    if (step.repeats) {
      const last = await db
        .select({
          advancementId: this.table.advancementId,
          entityId: this.table.entityId,
          ordinal: max(this.table.ordinal),
        })
        .from(this.table)
        .where(
          this.scope(
            inArray(
              this.table.advancementId,
              values.map((row) => row.characterLevelId as string),
            ),
          ),
        )
        .groupBy(this.table.advancementId, this.table.entityId);
      for (const row of last) next.set(key(row.advancementId, row.entityId ?? ""), (row.ordinal ?? -1) + 1);
    }
    const rows = values.map((row) => {
      const advancementId = row.characterLevelId as string;
      const entityId = row[pick.entity] as string;
      const ordinal = step.repeats ? (next.get(key(advancementId, entityId)) ?? 0) : 0;
      next.set(key(advancementId, entityId), ordinal + 1);
      const viaId = pick.via ? ((row[pick.via] as string | null | undefined) ?? null) : null;
      return {
        id: pick.id ? (row.id as string | undefined) : undefined,
        advancementId,
        step: pick.step,
        entityId,
        entityType: step.entityType,
        viaId,
        viaType: viaId ? step.viaType : null,
        amount: pick.amount ? (row[pick.amount] as number) : null,
        ordinal,
        repeats: step.repeats,
      };
    });
    return (await db.insert(this.table).values(rows).returning(this.columns())) as unknown as R[];
  }

  // Exception to soft-delete: old picks are disposable when re-finalizing a level
  async delete(db: Db, where: { characterLevelId: string }) {
    return await db.delete(this.table).where(this.scope(eq(this.table.advancementId, where.characterLevelId)));
  }

  /**
   * The picks of these character levels, by the picked entity's name, ties broken to a fixed order: a stackable feat a
   * level picked twice, by its ordinal.
   */
  async findMany(db: Db, where: { characterLevelIds: string[] }): Promise<R[]> {
    if (where.characterLevelIds.length === 0) return [];
    const rows = await db
      .select(this.columns())
      .from(this.table)
      .leftJoin(entitiesInRules, eq(entitiesInRules.id, this.table.entityId))
      .where(this.scope(inArray(this.table.advancementId, where.characterLevelIds)))
      .orderBy(
        this.orderBy(entitiesInRules.name),
        this.orderBy(this.table.entityId),
        this.orderBy(this.table.viaId),
        this.orderBy(this.table.advancementId),
        this.orderBy(this.table.ordinal),
        this.orderBy(this.table.id),
      );
    return rows as unknown as R[];
  }
}

export default LevelPicksRepository;
