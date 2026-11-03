import { and, eq, inArray, type InferInsertModel } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class EntitySnapshotsRepository extends BaseRepository<typeof entitySnapshotsInRules> {
  constructor() {
    super(entitySnapshotsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof entitySnapshotsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { rulesetId: string; sourceEntityId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.sourceEntityId, where.sourceEntityId), eq(this.table.rulesetId, where.rulesetId)));
  }

  /** A ruleset's snapshots (`rulesetId`, or those of these sources), or these rulesets' (`rulesetIds`), as stored. */
  async findMany(
    db: Db,
    where: { rulesetId: string } | { rulesetIds: string[] } | { rulesetId: string; sourceEntityIds: string[] },
  ) {
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    if ("sourceEntityIds" in where && where.sourceEntityIds.length === 0) return [];
    return await db.query.entitySnapshotsInRules.findMany({
      where: this.branchWhere(
        [
          "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
          "rulesetIds" in where && inArray(this.table.rulesetId, where.rulesetIds),
        ],
        ["sourceEntityIds" in where && inArray(this.table.sourceEntityId, where.sourceEntityIds)],
      ),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.id)],
    });
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
