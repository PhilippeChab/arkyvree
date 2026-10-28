import { and, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entitySnapshotsInRules } from "@/drizzle/schema.ts";

import { RULESET_ENTITY_TYPES, type RulesetEntityType } from "./entityTypes.ts";

/**
 * The rows `findNames` reads: a ruleset's own, those with these ids, or the rows of these rulesets, of these names when
 * it's given them.
 */
type NamesWhere = { rulesetId: string } | { ids: string[] } | { names?: string[]; rulesetIds: string[] };

/** An entity's id and name, with its type and its ruleset: what the name queries answer. */
const NAMED = {
  entityType: sql<RulesetEntityType>`${entitiesInRules.type}`.as("entity_type"),
  id: entitiesInRules.id,
  name: sql<string>`${entitiesInRules.name}`.as("name"),
  rulesetId: entitiesInRules.rulesetId,
};

/** Queries across every ruleset entity type, a type at a time or all together: one table holds them all. */
class RulesetEntitiesRepository {
  /** What `findNames` reads an entity type's rows by: its `where`'s branch. */
  private namesCondition(where: NamesWhere) {
    if ("rulesetIds" in where) {
      return and(
        inArray(entitiesInRules.rulesetId, where.rulesetIds),
        where.names && inArray(entitiesInRules.name, where.names),
      );
    }
    if ("ids" in where) return inArray(entitiesInRules.id, where.ids);
    return eq(entitiesInRules.rulesetId, where.rulesetId);
  }

  /** An entity type's ids and names, each with its ruleset (`where`: which rows). */
  async findNames(db: Db, entityType: RulesetEntityType, where: NamesWhere) {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("rulesetIds" in where && (where.rulesetIds.length === 0 || where.names?.length === 0)) return [];
    return await db
      .select({
        id: entitiesInRules.id,
        name: sql<string>`${entitiesInRules.name}`,
        rulesetId: entitiesInRules.rulesetId,
      })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, entityType), this.namesCondition(where)));
  }

  /**
   * The rulesets' own entities of these types, by id and name, each with its type and ruleset: rows of the
   * ruleset itself, not a copy-on-write copy (a copy pairs with its source by its snapshot).
   */
  async findNativeNames(db: Db, where: { entityTypes: string[]; rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return [];
    if (where.entityTypes.length === 0) return [];
    // One order, whatever the plan: the reprint pass meets its groups in it
    return await db
      .select(NAMED)
      .from(entitiesInRules)
      .leftJoin(
        entitySnapshotsInRules,
        and(
          eq(entitySnapshotsInRules.forkedEntityId, entitiesInRules.id),
          eq(entitySnapshotsInRules.rulesetId, entitiesInRules.rulesetId),
        ),
      )
      .where(
        and(
          inArray(entitiesInRules.type, where.entityTypes),
          inArray(entitiesInRules.rulesetId, where.rulesetIds),
          isNull(entitySnapshotsInRules.id),
        ),
      )
      .orderBy(entitiesInRules.type, entitiesInRules.name, entitiesInRules.id);
  }

  /**
   * The entities of every type, by id and name, each with its type and ruleset, of a ruleset (`rulesetId`) and of
   * these rulesets (`rulesetIds`, its extensions) whose name the ruleset has and one of these has too: its own rows,
   * copies included (a copy shows under its own name).
   */
  async findOwnNamesakes(db: Db, where: { rulesetId: string; rulesetIds: string[] }) {
    if (where.rulesetIds.length === 0) return [];
    const namesake = alias(entitiesInRules, "namesake");
    // An entity of the same type and name in one of `rulesetIds`
    const namedIn = (rulesetIds: string[]) =>
      exists(
        db
          .select({ one: sql`1` })
          .from(namesake)
          .where(
            and(
              eq(namesake.type, entitiesInRules.type),
              eq(namesake.name, entitiesInRules.name),
              inArray(namesake.rulesetId, rulesetIds),
            ),
          ),
      );
    // One order, whatever the plan: the pass meets its groups in it
    return await db
      .select(NAMED)
      .from(entitiesInRules)
      .where(
        and(
          inArray(entitiesInRules.type, RULESET_ENTITY_TYPES),
          inArray(entitiesInRules.rulesetId, [where.rulesetId, ...where.rulesetIds]),
          namedIn([where.rulesetId]),
          namedIn(where.rulesetIds),
        ),
      )
      .orderBy(entitiesInRules.type, entitiesInRules.name, entitiesInRules.id);
  }
}

export default RulesetEntitiesRepository;
