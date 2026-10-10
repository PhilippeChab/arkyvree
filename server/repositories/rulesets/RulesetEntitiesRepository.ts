import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entitySnapshotsInRules } from "@/drizzle/schema.ts";

import { ENTITY_TABLES, type RulesetEntityType } from "./entityTables.ts";

/**
 * The rows `findNames` reads: a ruleset's own, those with these ids, or the live rows of these rulesets themselves (not a
 * campaign's), of these names when it's given them.
 */
type NamesWhere = { rulesetId: string } | { ids: string[] } | { names?: string[]; rulesetIds: string[] };

/** Queries across every ruleset entity's table, an entity type at a time or all together. */
class RulesetEntitiesRepository {
  /** What `findNames` reads an entity type's rows by: its `where`'s branch. */
  private namesCondition(table: (typeof ENTITY_TABLES)[RulesetEntityType], where: NamesWhere) {
    if ("rulesetIds" in where) {
      return and(
        inArray(table.rulesetId, where.rulesetIds),
        where.names && inArray(table.name, where.names),
        isNull(table.deletedAt),
        isNull(table.campaignId),
      );
    }
    if ("ids" in where) return inArray(table.id, where.ids);
    return eq(table.rulesetId, where.rulesetId);
  }

  /** An entity type's ids and names, each with its ruleset (`where`: which rows). */
  async findNames(db: Db, entityType: RulesetEntityType, where: NamesWhere) {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("rulesetIds" in where && (where.rulesetIds.length === 0 || where.names?.length === 0)) return [];
    const table = ENTITY_TABLES[entityType];
    return await db
      .select({ id: table.id, name: table.name, rulesetId: table.rulesetId })
      .from(table)
      .where(this.namesCondition(table, where));
  }

  /**
   * The rulesets' own entities of these types, by id and name, each with its type and ruleset: live rows of the
   * ruleset itself, not a campaign's, and not a copy-on-write copy (a copy pairs with its source by its snapshot).
   */
  async findNativeNames(db: Db, where: { entityTypes: RulesetEntityType[]; rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return [];
    if (where.entityTypes.length === 0) return [];
    const subqueries = where.entityTypes.map((entityType) => {
      const table = ENTITY_TABLES[entityType];
      return db
        .select({
          entityType: sql<RulesetEntityType>`${entityType}::text`.as("entity_type"),
          id: table.id,
          name: table.name,
          rulesetId: table.rulesetId,
        })
        .from(table)
        .leftJoin(
          entitySnapshotsInRules,
          and(
            eq(entitySnapshotsInRules.forkedEntityId, table.id),
            eq(entitySnapshotsInRules.rulesetId, table.rulesetId),
            eq(entitySnapshotsInRules.entityType, entityType),
          ),
        )
        .where(
          and(
            inArray(table.rulesetId, where.rulesetIds),
            isNull(entitySnapshotsInRules.id),
            isNull(table.deletedAt),
            isNull(table.campaignId),
          ),
        );
    });
    const [first, second, ...rest] = subqueries;
    // One order, whatever the plan: the name pass meets its groups in it (the union's own columns)
    return await unionAll(first, second, ...rest).orderBy(sql`entity_type, name, id`);
  }
}

export default RulesetEntitiesRepository;
