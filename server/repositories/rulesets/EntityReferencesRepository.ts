import { and, type Column, eq, exists, inArray, type SQL, sql } from "drizzle-orm";
import { alias, type PgColumn, union, unionAll } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import {
  advancementPicksInCharacter,
  advancementsInCharacter,
  charactersInCharacter,
  entitiesInRules,
  entityLinksInRules,
  linksInCharacter,
  rulesetLinksInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { toQualified } from "@/server/repositories/stored/toQualified.ts";

import {
  ENTITY_REFERENCES,
  type EntityReference,
  type ReferencedType,
  type ReferenceOwner,
} from "./entityReferences.ts";
import type { RulesetEntityType } from "./entityTypes.ts";
import { buildLineageCondition } from "./rulesetLineage.ts";

/** What a character's row naming an entity belongs to: the character, or one of its levels. */
type CharacterOwner = Extract<ReferenceOwner, { advancementId: PgColumn } | { characterId: PgColumn }>;

/** The property a table's column is under (`entityId` for `entity_id`): what an update sets. */
function columnKey(column: Column) {
  return column.name.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase());
}

/** Whether a row naming an entity is a character's: the character itself, or one of its levels. */
function isCharacters(owner: ReferenceOwner): owner is CharacterOwner {
  return "characterId" in owner || "advancementId" in owner;
}

/**
 * The rows that name an entity, every generic table's (`ENTITY_REFERENCES`): those of a ruleset an unsubscribe would
 * leave dangling (`findMany`), the characters an in-use check counts (`exists`), and every row a revert points at
 * another entity (`update`), a restore's or an unsubscribe's (`EntityRevert`), or one ruleset's rows an unsubscribe
 * points at what its view shows once the extension is gone.
 */
class EntityReferencesRepository {
  /** The ids of the characters on `rulesetId` or on a ruleset built on it (a fork, a subscriber). */
  private charactersOf(db: Db, rulesetId: string) {
    return db
      .select({ id: charactersInCharacter.id })
      .from(charactersInCharacter)
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, rulesetId));
  }

  /**
   * Whether a row belongs to `rulesetId`, by what it belongs to: one of the ruleset's entities (an owned one, a class
   * level, is in its class's ruleset), the ruleset itself, or a character on the ruleset or on a ruleset built on it.
   */
  private ownedBy(db: Db, owner: ReferenceOwner, rulesetId: string): SQL {
    if ("fromId" in owner) {
      return inArray(
        owner.fromId,
        db.select({ id: entitiesInRules.id }).from(entitiesInRules).where(eq(entitiesInRules.rulesetId, rulesetId)),
      );
    }
    if ("rulesetId" in owner) return eq(owner.rulesetId, rulesetId);
    const characters = this.charactersOf(db, rulesetId);
    if ("characterId" in owner) return inArray(owner.characterId, characters);
    return inArray(
      owner.advancementId,
      db
        .select({ id: advancementsInCharacter.id })
        .from(advancementsInCharacter)
        .where(inArray(advancementsInCharacter.characterId, characters)),
    );
  }

  /**
   * The ruleset's join when it's `rulesetId` or a ruleset built on it, by `rulesetIdColumn` (a character's ruleset): a
   * fork of it, or a ruleset subscribing to it as an extension. What an in-use check counts.
   */
  private rulesetOrDescendant(rulesetIdColumn: Column, rulesetId: string): SQL {
    return and(eq(rulesetsInRules.id, rulesetIdColumn), buildLineageCondition(rulesetId))!;
  }

  /** Whether a character on `rulesetId`, or on a ruleset built on it, names one of `ids` in `column`. */
  private async existsPick(
    db: Db,
    column: PgColumn,
    owner: CharacterOwner,
    where: { ids: string[]; rulesetId: string },
  ) {
    const rows = await db
      .select({ one: sql<number>`1` })
      .from(column.table)
      .where(and(inArray(column, where.ids), this.ownedBy(db, owner, where.rulesetId)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Points `column`'s `from` at `to`, every row's or `rulesetId`'s rows only (`ownedBy`), leaving the rows' `updatedAt`:
   * a repoint isn't an edit. A row that would then repeat another by its natural key goes instead: the one naming `to`
   * already stays. A pick of a step that repeats is numbered after `to`'s instead (a stackable feat picked twice).
   */
  private async repoint(db: Db, { column, owner }: EntityReference, from: string, to: string, rulesetId?: string) {
    const named = and(eq(column, from), rulesetId === undefined ? undefined : this.ownedBy(db, owner, rulesetId));
    if (column === entityLinksInRules.toId) {
      const twin = alias(entityLinksInRules, "twin");
      await db.delete(entityLinksInRules).where(
        and(
          named,
          exists(
            db
              .select({ one: sql<number>`1` })
              .from(twin)
              .where(
                and(
                  eq(twin.toId, to),
                  eq(twin.fromId, entityLinksInRules.fromId),
                  eq(twin.role, entityLinksInRules.role),
                ),
              ),
          ),
        ),
      );
    }
    if (column === linksInCharacter.entityId) {
      const twin = alias(linksInCharacter, "twin");
      await db.delete(linksInCharacter).where(
        and(
          named,
          exists(
            db
              .select({ one: sql<number>`1` })
              .from(twin)
              .where(
                and(
                  eq(twin.entityId, to),
                  eq(twin.characterId, linksInCharacter.characterId),
                  eq(twin.role, linksInCharacter.role),
                ),
              ),
          ),
        ),
      );
    }
    if (column === advancementPicksInCharacter.entityId) {
      const picks = advancementPicksInCharacter;
      const twin = alias(picks, "twin");
      // A repeated pick follows `to`'s at its advancement, its ordinal after theirs: one write, so that no row's new key
      // meets one still naming `from` (the unique index checks each row as it's written)
      await db
        .update(picks)
        .set({
          entityId: to,
          ordinal: sql`${toQualified(picks.ordinal)} + (SELECT coalesce(max(twin.ordinal), -1) + 1 FROM ${picks} twin WHERE twin.advancement_id = ${toQualified(picks.advancementId)} AND twin.step = ${toQualified(picks.step)} AND twin.entity_id = ${to})`,
        })
        .where(and(named, eq(picks.repeats, true)));
      await db.delete(picks).where(
        and(
          named,
          eq(picks.repeats, false),
          exists(
            db
              .select({ one: sql<number>`1` })
              .from(twin)
              .where(
                and(
                  eq(twin.entityId, to),
                  eq(twin.advancementId, picks.advancementId),
                  eq(twin.step, picks.step),
                  eq(twin.ordinal, picks.ordinal),
                ),
              ),
          ),
        ),
      );
    }
    await db
      .update(column.table)
      .set({ [columnKey(column)]: to })
      .where(named);
  }

  /**
   * Whether a character on `rulesetId`, or on a ruleset built on it (a fork of it, or a ruleset subscribing to it as an
   * extension), names one of `ids`: an in-use check. Archived characters count: one can be restored, and its picks must
   * still resolve.
   */
  async exists(db: Db, where: { entityType: ReferencedType; ids: string[]; rulesetId: string }): Promise<boolean> {
    if (where.ids.length === 0) return false;
    for (const { column, owner } of ENTITY_REFERENCES)
      if (isCharacters(owner) && (await this.existsPick(db, column, owner, where))) return true;
    return false;
  }

  /**
   * The ids among `entityIds` that `rulesetId`'s rows name (`ownedBy`): its entities' links and its own, and its
   * characters' and those of the characters on a ruleset built on it. What an unsubscribe points at what stands in
   * their place, each with `update`.
   */
  async findIds(db: Db, where: { entityIds: string[]; rulesetId: string }): Promise<string[]> {
    if (where.entityIds.length === 0) return [];
    const [first, second, ...rest] = ENTITY_REFERENCES.map(({ column, owner }) =>
      db
        .select({ id: sql<string>`${column}`.as("id") })
        .from(column.table)
        .where(and(inArray(column, where.entityIds), this.ownedBy(db, owner, where.rulesetId))),
    );
    const rows = await union(first, second, ...rest).orderBy(sql`id`);
    return rows.map((row) => row.id);
  }

  /**
   * A ruleset's rows that name one of `entityIds` (another ruleset's entities), each by what it's of (an entity's type,
   * id and name, a class level's by its class; the ruleset itself) and the entity it names (`targetId`): an entity's
   * link (an item's template, a class's or a race's parent, a spell's save, a save's or a skill's ability, a feat's or a
   * spell's list, a class's skill, a class level's saves and grants), and the ruleset's own (its skill point ability).
   * What the ruleset would keep dangling were those entities to leave it.
   */
  async findMany(db: Db, where: { entityIds: string[]; rulesetId: string }) {
    if (where.entityIds.length === 0) return [];
    const from = alias(entitiesInRules, "from_entity");
    const owner = alias(entitiesInRules, "owner_entity");
    const linked = (column: PgColumn) =>
      db
        .select({
          entityType: sql<RulesetEntityType>`coalesce(${owner.type}, ${from.type})`.as("entity_type"),
          id: sql<string>`coalesce(${owner.id}, ${from.id})`.as("id"),
          name: sql<string>`coalesce(${owner.name}, ${from.name})`.as("name"),
          targetId: sql<string>`${column}`.as("target_id"),
        })
        .from(entityLinksInRules)
        .innerJoin(from, eq(from.id, entityLinksInRules.fromId))
        .leftJoin(owner, eq(owner.id, from.ownerId))
        .where(and(inArray(column, where.entityIds), eq(from.rulesetId, where.rulesetId)));
    const ruleset = db
      .select({
        entityType: sql<RulesetEntityType>`'rulesets'`.as("entity_type"),
        id: rulesetsInRules.id,
        name: rulesetsInRules.name,
        targetId: sql<string>`${rulesetLinksInRules.toId}`.as("target_id"),
      })
      .from(rulesetLinksInRules)
      .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, rulesetLinksInRules.rulesetId))
      .where(
        and(inArray(rulesetLinksInRules.toId, where.entityIds), eq(rulesetLinksInRules.rulesetId, where.rulesetId)),
      );
    return await unionAll(linked(entityLinksInRules.toId), linked(entityLinksInRules.viaId), ruleset).orderBy(
      sql`entity_type, name, id, target_id`,
    );
  }

  /**
   * Points every row naming an entity (`where.entityId`) at another of its type (`values.entityId`): a ruleset's and a
   * character's, whatever their ruleset, or one ruleset's (`rulesetId`): its entities' links and its own, and its
   * characters' and those of the characters on a ruleset built on it. A row that would then repeat one naming the other
   * (a feat's link to a list it links to already) goes instead.
   */
  async update(
    db: Db,
    values: { entityId: string },
    where:
      | { entityId: string; entityType: ReferencedType }
      | { entityId: string; entityType: ReferencedType; rulesetId: string },
  ) {
    const rulesetId = "rulesetId" in where ? where.rulesetId : undefined;
    for (const reference of ENTITY_REFERENCES)
      await this.repoint(db, reference, where.entityId, values.entityId, rulesetId);
  }
}

export default EntityReferencesRepository;
