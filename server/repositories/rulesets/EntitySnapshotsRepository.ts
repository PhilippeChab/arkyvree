import { and, eq, inArray, type InferInsertModel, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entitySnapshotsInRules } from "@/drizzle/schema.ts";
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
   * The copies these rulesets' snapshots record (`rulesetIds`) whose name or description differs from what they copied,
   * each with those of its texts that differ (`forkedEntityId`, then its `name` and its `description` when they do): what
   * a view merges a sibling copy's texts by. A tombstone's copy is gone, and changed nothing.
   */
  async findTexts(db: Db, where: { rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return [];
    const copy = alias(entitiesInRules, "copy");
    const source = alias(entitiesInRules, "source");
    const renamed = sql<boolean>`${copy.name} IS DISTINCT FROM ${source.name}`;
    const redescribed = sql<boolean>`${copy.description} IS DISTINCT FROM ${source.description}`;
    const rows = await db
      .select({
        description: copy.description,
        forkedEntityId: this.table.forkedEntityId,
        name: copy.name,
        redescribed: redescribed.as("redescribed"),
        renamed: renamed.as("renamed"),
      })
      .from(this.table)
      .innerJoin(copy, eq(copy.id, this.table.forkedEntityId))
      .innerJoin(source, eq(source.id, this.table.sourceEntityId))
      .where(and(inArray(this.table.rulesetId, where.rulesetIds), or(renamed, redescribed)))
      .orderBy(this.orderBy(this.table.forkedEntityId));
    return rows.map(({ description, forkedEntityId, name, redescribed, renamed }) => ({
      forkedEntityId,
      ...(renamed && name !== null ? { name } : {}),
      ...(redescribed ? { description } : {}),
    }));
  }

  /**
   * Points the snapshots of one source entity at another: a revert's, whose fork's copy the rulesets built on the fork
   * copied in turn, so their copies stand for the source. None of them holds a snapshot of the other already: its view
   * showed the fork's copy in the other's place. Or one ruleset's snapshot of it (`rulesetId`): an unsubscribe's, whose
   * copy of the extension's copy stays, a copy of what stands in the extension's copy's place.
   */
  async update(
    db: Db,
    values: { sourceEntityId: string },
    where: { sourceEntityId: string } | { rulesetId: string; sourceEntityId: string },
  ) {
    return await db
      .update(this.table)
      .set(values)
      .where(
        this.branchWhere(
          [eq(this.table.sourceEntityId, where.sourceEntityId)],
          ["rulesetId" in where && eq(this.table.rulesetId, where.rulesetId)],
        ),
      )
      .returning();
  }
}

export default EntitySnapshotsRepository;
