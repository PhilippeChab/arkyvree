import { and, eq, getTableColumns, inArray, type InferInsertModel, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entitySnapshotsInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

import type { RulesetEntityType } from "./entityTypes.ts";

class EntitySnapshotsRepository extends BaseRepository<typeof entitySnapshotsInRules> {
  constructor() {
    super(entitySnapshotsInRules);
  }

  /**
   * Locks a row (`{ id }`), or a fork's copy of a source entity (`{ rulesetId, sourceEntityId }`): an advisory lock
   * scoped to the pair, since there may be no snapshot row to lock yet, so unrelated copies proceed independently.
   */
  override async lock(
    db: Db,
    where: { id: string } | { rulesetId: string; sourceEntityId: string },
    mode: "update" | "share" = "update",
    skipLocked = false,
  ): Promise<boolean> {
    if ("id" in where) return await super.lock(db, where, mode, skipLocked);
    return await this.lockCopy(db, where.rulesetId, where.sourceEntityId);
  }

  /** A copy's advisory lock, for its ruleset and source entity: there may be no snapshot row to lock yet. */
  private async lockCopy(db: Db, rulesetId: string, sourceEntityId: string) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cow:${rulesetId}:${sourceEntityId}`}, 0))`);
    return true;
  }

  async create(db: Db, values: InferInsertModel<typeof entitySnapshotsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { rulesetId: string; sourceEntityId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.sourceEntityId, where.sourceEntityId), eq(this.table.rulesetId, where.rulesetId)));
  }

  /**
   * A ruleset's snapshots (`rulesetId`, of a type, or of these sources), or these rulesets' (`rulesetIds`), each with
   * its entities' type (`entityType`): its copy's, or its source's once its copy is deleted (a tombstone). One whose
   * copy and source are both gone stands for nothing, and isn't read.
   */
  async findMany(
    db: Db,
    where:
      | { rulesetId: string }
      | { rulesetIds: string[] }
      | { entityType: RulesetEntityType; rulesetId: string }
      | { rulesetId: string; sourceEntityIds: string[] },
  ) {
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    if ("sourceEntityIds" in where && where.sourceEntityIds.length === 0) return [];
    const forked = alias(entitiesInRules, "forked");
    const source = alias(entitiesInRules, "source");
    const entityType = sql<RulesetEntityType>`coalesce(${forked.type}, ${source.type})`;
    return await db
      .select({ ...getTableColumns(this.table), entityType: entityType.as("entity_type") })
      .from(this.table)
      .leftJoin(forked, eq(forked.id, this.table.forkedEntityId))
      .leftJoin(source, eq(source.id, this.table.sourceEntityId))
      .where(
        this.branchWhere(
          [
            "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
            "rulesetIds" in where && inArray(this.table.rulesetId, where.rulesetIds),
          ],
          [
            "entityType" in where && eq(entityType, where.entityType),
            "sourceEntityIds" in where && inArray(this.table.sourceEntityId, where.sourceEntityIds),
            isNotNull(entityType),
          ],
        ),
      )
      .orderBy(this.orderBy(this.table.createdAt), this.orderBy(this.table.id));
  }

  async findOne(db: Db, where: { rulesetId: string; sourceEntityId: string }) {
    return await db.query.entitySnapshotsInRules.findFirst({
      where: and(eq(this.table.sourceEntityId, where.sourceEntityId), eq(this.table.rulesetId, where.rulesetId)),
    });
  }

  /**
   * Points the snapshots of one source entity at another: a revert's, whose fork's copy the rulesets built on the fork
   * copied in turn, so their copies stand for the source. None of them holds a snapshot of the other already: its view
   * showed the fork's copy in the other's place.
   */
  async update(db: Db, values: { sourceEntityId: string }, where: { sourceEntityId: string }) {
    return await db
      .update(this.table)
      .set(values)
      .where(eq(this.table.sourceEntityId, where.sourceEntityId))
      .returning();
  }
}

export default EntitySnapshotsRepository;
