import { and, eq, inArray } from "drizzle-orm";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import BaseRepository, { Instance } from "@/server/repositories/BaseRepository.ts";

import type { Db } from "@/server/database/index.ts";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

class EntitySnapshotsRepository extends BaseRepository<typeof entitySnapshotsInRules, EntitySnapshotInstance> {
  constructor() {
    super(entitySnapshotsInRules);
  }

  async create(db: Db, values: InferInsertModel<typeof entitySnapshotsInRules>) {
    return await db.insert(this.table).values(values).returning();
  }

  async createMany(db: Db, values: InferInsertModel<typeof entitySnapshotsInRules>[]) {
    if (values.length === 0) return [];
    return await db.insert(this.table).values(values).returning();
  }

  async update(): Promise<never> {
    throw new Error("Snapshots are immutable — delete and recreate instead");
  }

  async archive(): Promise<never> {
    throw new Error("Snapshots do not support soft delete — use deleteByRulesetId");
  }

  async findOne(db: Db, where: { id: string }) {
    return await db.query.entitySnapshotsInRules.findFirst({
      where: eq(this.table.id, where.id),
    });
  }

  async findByRulesetId(db: Db, where: { rulesetId: string }) {
    return await db.query.entitySnapshotsInRules.findMany({
      where: eq(this.table.rulesetId, where.rulesetId),
    });
  }

  async findByRulesetIds(db: Db, where: { rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return [];
    return await db.query.entitySnapshotsInRules.findMany({
      where: inArray(this.table.rulesetId, where.rulesetIds),
    });
  }

  async findByTypeAndRuleset(db: Db, where: { rulesetId: string; entityType: string }) {
    return await db.query.entitySnapshotsInRules.findMany({
      where: and(
        eq(this.table.rulesetId, where.rulesetId),
        eq(this.table.entityType, where.entityType),
      ),
    });
  }

  async findBySourceAndRuleset(db: Db, where: { sourceEntityId: string; rulesetId: string }) {
    return await db.query.entitySnapshotsInRules.findFirst({
      where: and(
        eq(this.table.sourceEntityId, where.sourceEntityId),
        eq(this.table.rulesetId, where.rulesetId),
      ),
    });
  }

  async findManyBySourcesAndRuleset(db: Db, where: { sourceEntityIds: string[]; rulesetId: string }) {
    if (where.sourceEntityIds.length === 0) return [];
    return await db.query.entitySnapshotsInRules.findMany({
      where: and(
        inArray(this.table.sourceEntityId, where.sourceEntityIds),
        eq(this.table.rulesetId, where.rulesetId),
      ),
    });
  }

  async deleteBySourceAndRuleset(db: Db, where: { sourceEntityId: string; rulesetId: string }) {
    return await db.delete(this.table).where(
      and(
        eq(this.table.sourceEntityId, where.sourceEntityId),
        eq(this.table.rulesetId, where.rulesetId),
      ),
    );
  }

  async deleteByRulesetId(db: Db, where: { rulesetId: string }) {
    return await db.delete(this.table).where(eq(this.table.rulesetId, where.rulesetId));
  }

  withInstance(instance: InferSelectModel<typeof entitySnapshotsInRules>) {
    return new EntitySnapshotInstance(instance);
  }
}

class EntitySnapshotInstance extends Instance<InferSelectModel<typeof entitySnapshotsInRules>> {}

export default EntitySnapshotsRepository;
