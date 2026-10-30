import { and, eq, inArray, max } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { advancementPicksInCharacter, entitiesInRules } from "@/drizzle/schema.ts";
import { type CharacterRows, Engine, type PickPlan } from "@/engine/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

/**
 * Every module's advancement picks (`character.advancement_picks`: 3.5's hit points, ability increases, skill ranks,
 * feats and spells), each an advancement's pick of a step its module declares (`Engine.storage().step`): the entity it
 * picks, through a pool if its step takes one, with an amount if it holds one; read as stored, by step. What names an
 * entity, a pick among them, an in-use check finds by the list of every row naming one (`EntityReferences.exists`).
 */
class StoredPicks extends BaseRepository<typeof advancementPicksInCharacter> {
  constructor() {
    super(advancementPicksInCharacter);
  }

  /** What an advancement's picks of an entity of a step are keyed by, as `findLastOrdinals` keys them. */
  private static ordinalKey(advancementId: string, step: string, entityId: string | null) {
    return `${advancementId}:${step}:${entityId ?? ""}`;
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
   * The ordinal each advancement's last pick of an entity of a step that repeats (3.5's feats) holds, by
   * `advancementId:step:entityId` (`ordinalKey`): what a write of a pick of it again numbers after.
   */
  private async findLastOrdinals(db: Db, picks: (PickPlan & { advancementId: string })[]) {
    const last = new Map<string, number>();
    const repeating = picks.filter((pick) => Engine.storage().step(pick.step).repeats);
    if (repeating.length === 0) return last;
    const rows = await db
      .select({
        advancementId: this.table.advancementId,
        entityId: this.table.entityId,
        ordinal: max(this.table.ordinal),
        step: this.table.step,
      })
      .from(this.table)
      .where(
        and(
          inArray(this.table.advancementId, [...new Set(repeating.map((pick) => pick.advancementId))]),
          inArray(this.table.step, [...new Set(repeating.map((pick) => pick.step))]),
        ),
      )
      .groupBy(this.table.advancementId, this.table.step, this.table.entityId);
    for (const row of rows)
      last.set(StoredPicks.ordinalKey(row.advancementId, row.step, row.entityId), row.ordinal ?? -1);
    return last;
  }

  /**
   * Writes advancements' picks (`picks`, each under its advancement): each step's entity and pool types as its module
   * declares them, and a step that repeats (3.5's feats) numbers an entity picked again at one advancement after its
   * last.
   */
  async createMany(db: Db, picks: (PickPlan & { advancementId: string })[]) {
    if (picks.length === 0) return;
    const next = await this.findLastOrdinals(db, picks);
    const rows = picks.map(({ advancementId, amount, entityId, step, viaId }) => {
      const declared = Engine.storage().step(step);
      const key = StoredPicks.ordinalKey(advancementId, step, entityId ?? null);
      const ordinal = declared.repeats ? (next.get(key) ?? -1) + 1 : 0;
      next.set(key, ordinal);
      return {
        advancementId,
        step,
        entityId: entityId ?? null,
        entityType: entityId === undefined ? null : declared.entityType,
        viaId: viaId ?? null,
        viaType: viaId === undefined ? null : declared.viaType,
        amount: amount ?? null,
        repeats: declared.repeats,
        ordinal,
      };
    });
    await db.insert(this.table).values(rows);
  }

  /** Deletes an advancement's picks: a level's save writes them again. */
  async delete(db: Db, where: { advancementId: string }) {
    return await db.delete(this.table).where(eq(this.table.advancementId, where.advancementId));
  }

  /**
   * The picks of these advancements, by step: every step its modules declare (`Engine.storage().registries().steps`),
   * each one's by the picked entity's name, ties broken to a fixed order (a stackable feat a level picked twice, by its
   * ordinal), read in one query.
   */
  async findPerStep(db: Db, where: { advancementIds: string[] }): Promise<CharacterRows["picks"]> {
    const picks: CharacterRows["picks"] = Object.fromEntries(
      Engine.storage()
        .registries()
        .steps.map(({ step }) => [step, []]),
    );
    if (where.advancementIds.length === 0) return picks;
    const rows = await db
      .select({
        advancementId: this.table.advancementId,
        amount: this.table.amount,
        createdAt: this.table.createdAt,
        entityId: this.table.entityId,
        id: this.table.id,
        step: this.table.step,
        updatedAt: this.table.updatedAt,
        viaId: this.table.viaId,
      })
      .from(this.table)
      .leftJoin(entitiesInRules, eq(entitiesInRules.id, this.table.entityId))
      .where(inArray(this.table.advancementId, where.advancementIds))
      .orderBy(...this.pickOrder());
    for (const { step, ...pick } of rows) picks[step].push(pick);
    return picks;
  }
}

export default StoredPicks;
