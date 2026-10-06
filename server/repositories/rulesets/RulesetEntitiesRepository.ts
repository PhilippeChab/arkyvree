import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type AnyPgColumn, unionAll } from "drizzle-orm/pg-core";

import {
  entitySnapshotsInRules,
  itemsInRules,
  klassesInRules,
  klassLevelFeatsInRules,
  klassLevelPowersInRules,
  klassLevelSavesInRules,
  klassLevelsInRules,
  klassSkillsInRules,
  powersInRules,
  racesInRules,
  savesInRules,
  skillsInRules,
} from "@/drizzle/schema.ts";
import type { Db } from "@/server/database/index.ts";

import { ENTITY_TABLES, type RulesetEntityType } from "./entityTables.ts";

/** Queries across every ruleset entity's table, an entity type at a time or all together. */
class RulesetEntitiesRepository {
  /** An entity type's ids and names: a ruleset's own rows, or the rows with these ids. */
  async findNames(db: Db, entityType: RulesetEntityType, where: { rulesetId: string } | { ids: string[] }) {
    if ("ids" in where && where.ids.length === 0) return [];
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
    if (where.rulesetIds.length === 0) return [];
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

  /**
   * A ruleset's rows that name one of `entityIds` (another ruleset's entities), each by its entity's type, id and name,
   * and the entity it names (`targetId`): an item's template, a class's or a race's parent, a spell's save, a save's or
   * a skill's ability, and, by the class, its skills and its levels' saves, granted feats and granted spells. What the
   * ruleset would keep dangling were those entities to leave it.
   */
  async findReferences(db: Db, where: { rulesetId: string; entityIds: string[] }) {
    if (where.entityIds.length === 0) return [];
    const { rulesetId, entityIds } = where;
    const columns = (entityType: RulesetEntityType, column: AnyPgColumn) => {
      const table = ENTITY_TABLES[entityType];
      return {
        entityType: sql<RulesetEntityType>`${entityType}::text`.as("entity_type"),
        id: table.id,
        name: table.name,
        targetId: sql<string>`${column}`.as("target_id"),
      };
    };
    const ownRows = (entityType: RulesetEntityType, column: AnyPgColumn) => {
      const table = ENTITY_TABLES[entityType];
      return db
        .select(columns(entityType, column))
        .from(table)
        .where(and(eq(table.rulesetId, rulesetId), inArray(column, entityIds), isNull(table.deletedAt)));
    };
    const klassOwned = and(eq(klassesInRules.rulesetId, rulesetId), isNull(klassesInRules.deletedAt));
    const levelRows = (
      column: AnyPgColumn,
      table: typeof klassLevelSavesInRules | typeof klassLevelFeatsInRules | typeof klassLevelPowersInRules,
    ) =>
      db
        .select(columns("klasses", column))
        .from(table)
        .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, table.klassLevelId))
        .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
        .where(and(klassOwned, inArray(column, entityIds), isNull(table.deletedAt)));
    const [first, second, ...rest] = [
      ownRows("items", itemsInRules.sourceItemId),
      ownRows("klasses", klassesInRules.parentId),
      ownRows("races", racesInRules.parentId),
      ownRows("powers", powersInRules.saveId),
      ownRows("saves", savesInRules.abilityId),
      ownRows("skills", skillsInRules.primaryAbilityId),
      db
        .select(columns("klasses", klassSkillsInRules.skillId))
        .from(klassSkillsInRules)
        .innerJoin(klassesInRules, eq(klassesInRules.id, klassSkillsInRules.klassId))
        .where(and(klassOwned, inArray(klassSkillsInRules.skillId, entityIds), isNull(klassSkillsInRules.deletedAt))),
      levelRows(klassLevelSavesInRules.saveId, klassLevelSavesInRules),
      levelRows(klassLevelFeatsInRules.featId, klassLevelFeatsInRules),
      levelRows(klassLevelPowersInRules.powerId, klassLevelPowersInRules),
    ];
    return await unionAll(first, second, ...rest).orderBy(sql`entity_type, name, id, target_id`);
  }
}

export default RulesetEntitiesRepository;
