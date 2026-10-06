import { and, eq, inArray, sql } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";

class EntitySnapshotsRepository extends BaseRepository<typeof entitySnapshotsInRules> {
  constructor() {
    super(entitySnapshotsInRules);
  }

  /** A copy's advisory lock, for its ruleset and source entity: there may be no snapshot row to lock yet. */
  private async lockCopy(db: Db, rulesetId: string, sourceEntityId: string) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`cow:${rulesetId}:${sourceEntityId}`}, 0))`);
    return true;
  }

  async create(db: Db, values: InferInsertModel<typeof entitySnapshotsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async delete(db: Db, where: { sourceEntityId: string; rulesetId: string }) {
    return await db
      .delete(this.table)
      .where(and(eq(this.table.sourceEntityId, where.sourceEntityId), eq(this.table.rulesetId, where.rulesetId)));
  }

  async findMany(
    db: Db,
    where:
      | { rulesetId: string }
      | { rulesetIds: string[] }
      | { rulesetId: string; entityType: string }
      | { rulesetId: string; sourceEntityIds: string[] },
  ) {
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    if ("sourceEntityIds" in where && where.sourceEntityIds.length === 0) return [];
    return await db.query.entitySnapshotsInRules.findMany({
      where: this.branchWhere(
        [
          "rulesetId" in where && eq(this.table.rulesetId, where.rulesetId),
          "rulesetIds" in where && inArray(this.table.rulesetId, where.rulesetIds),
        ],
        [
          "entityType" in where && eq(this.table.entityType, where.entityType),
          "sourceEntityIds" in where && inArray(this.table.sourceEntityId, where.sourceEntityIds),
        ],
      ),
      orderBy: [this.orderBy(this.table.createdAt), this.orderBy(this.table.id)],
    });
  }

  async findOne(db: Db, where: { sourceEntityId: string; rulesetId: string }) {
    return await db.query.entitySnapshotsInRules.findFirst({
      where: and(eq(this.table.sourceEntityId, where.sourceEntityId), eq(this.table.rulesetId, where.rulesetId)),
    });
  }

  /**
   * Locks a row (`{ id }`), or a fork's copy of a source entity (`{ rulesetId, sourceEntityId }`): an advisory lock
   * scoped to the pair, since there may be no snapshot row to lock yet, so unrelated copies proceed independently.
   */
  async lock(
    db: Db,
    where: { id: string } | { rulesetId: string; sourceEntityId: string },
    mode: "update" | "share" = "update",
    skipLocked = false,
  ): Promise<boolean> {
    if ("id" in where) return await super.lock(db, where, mode, skipLocked);
    return await this.lockCopy(db, where.rulesetId, where.sourceEntityId);
  }
}

export default EntitySnapshotsRepository;
