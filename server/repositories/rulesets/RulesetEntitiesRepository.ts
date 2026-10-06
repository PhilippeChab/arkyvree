import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

import { entitySnapshotsInRules } from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

import { ENTITY_TABLES, type RulesetEntityType } from "./entityTables.ts";

/** Queries across every ruleset entity's table, an entity type at a time or all together. */
class RulesetEntitiesRepository {
  /** An entity type's ids and names: a ruleset's own rows, or the rows with these ids. */
  async findNames(db: Db, entityType: RulesetEntityType, where: { rulesetId: string } | { ids: string[] }) {
    const table = ENTITY_TABLES[entityType];
    return await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where("rulesetId" in where ? eq(table.rulesetId, where.rulesetId) : inArray(table.id, where.ids));
  }

  /**
   * The rulesets' own entities of these types, by id and name, each with its type and ruleset: live rows of the
   * ruleset itself, not a campaign's, and not a copy-on-write copy (a copy keeps its source's name).
   */
  async findNativeNames(db: Db, where: { rulesetIds: string[]; entityTypes: RulesetEntityType[] }) {
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
