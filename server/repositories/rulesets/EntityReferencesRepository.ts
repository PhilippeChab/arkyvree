import { and, type Column, eq, exists, getTableColumns, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { alias, getTableConfig, type PgColumn, union, unionAll } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import {
  charactersInCharacter,
  klassesInRules,
  klassLevelsInRules,
  levelsInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";

import {
  ENTITY_REFERENCES,
  type EntityReference,
  type ReferencedType,
  type ReferenceOwner,
} from "./entityReferences.ts";
import { ENTITY_TABLES, type RulesetEntityType } from "./entityTables.ts";

/** What a character's row naming an entity belongs to: the character, or one of its levels. */
type CharacterOwner = Extract<ReferenceOwner, { characterId: PgColumn } | { characterLevelId: PgColumn }>;

/** What a ruleset's row naming an entity belongs to: an entity, or a class's level. */
type RulesetOwner = Exclude<ReferenceOwner, CharacterOwner>;

/** Whether a row naming an entity is a character's: the character itself, or one of its rows. */
function isCharacters(owner: ReferenceOwner): owner is CharacterOwner {
  return "characterId" in owner || "characterLevelId" in owner;
}

/**
 * Whether a ruleset's row naming an entity is a link: a row of its own, joined to the entity it belongs to (a feat's
 * link to a list, a class's skill) or to a class's level (its grants, its saves). Not an entity's field (a spell's
 * save), which is the entity's row itself.
 */
function isLink(column: PgColumn, owner: RulesetOwner) {
  return "klassLevelId" in owner || column.table !== ENTITY_TABLES[owner.entityType];
}

/** The property a table's column is under (`featId` for `feat_id`): what an update sets. */
function keyOf(columns: Record<string, Column>, column: Column) {
  const key = Object.keys(columns).find((name) => columns[name].name === column.name);
  if (!key) throw new Error(`EntityReferencesRepository: no column ${column.name}`);
  return key;
}

/**
 * The rows that name an entity, every table's (`ENTITY_REFERENCES`): those of a ruleset an unsubscribe would leave
 * dangling (`findMany`), the characters an in-use check counts (`exists`), and every row a revert points at another
 * entity (`update`), a restore's or an unsubscribe's (`EntityRevert`), or one ruleset's rows an unsubscribe points at
 * what its view shows once the extension is gone.
 */
class EntityReferencesRepository {
  /**
   * Whether a row belongs to `rulesetId`, by what it belongs to: one of the ruleset's entities or its classes' levels
   * (the rows `findMany` reads), or a character on the ruleset or on a ruleset built on it (those `exists` counts).
   */
  private ownedBy(db: Db, owner: ReferenceOwner, rulesetId: string): SQL {
    if (isCharacters(owner)) {
      const characters = db
        .select({ id: charactersInCharacter.id })
        .from(charactersInCharacter)
        .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, rulesetId));
      if ("characterId" in owner) return inArray(owner.characterId, characters);
      const levels = db
        .select({ id: levelsInCharacter.id })
        .from(levelsInCharacter)
        .where(inArray(levelsInCharacter.characterId, characters));
      return inArray(owner.characterLevelId, levels);
    }
    if ("klassLevelId" in owner) {
      const levels = db
        .select({ id: klassLevelsInRules.id })
        .from(klassLevelsInRules)
        .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
        .where(eq(klassesInRules.rulesetId, rulesetId));
      return inArray(owner.klassLevelId, levels);
    }
    const entity = ENTITY_TABLES[owner.entityType];
    return inArray(owner.id, db.select({ id: entity.id }).from(entity).where(eq(entity.rulesetId, rulesetId)));
  }

  /**
   * The ruleset's join when it's `rulesetId` or a ruleset built on it, by `rulesetIdColumn` (a character's ruleset): a
   * fork of it, or a ruleset subscribing to it as an extension. What an in-use check counts.
   */
  private rulesetOrDescendant(rulesetIdColumn: Column, rulesetId: string): SQL {
    return and(
      eq(rulesetsInRules.id, rulesetIdColumn),
      or(
        eq(rulesetsInRules.id, rulesetId),
        sql`${rulesetsInRules.ancestorRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
        sql`${rulesetsInRules.extensionRulesetIds} @> ARRAY[${rulesetId}::uuid]`,
      ),
    )!;
  }

  /**
   * The ruleset's rows naming one of `entityIds` in `column`, each by the entity it's of, its type, id and name (a
   * class level's by its class), and the entity it names (`targetId`).
   */
  private selectOwned(
    db: Db,
    column: PgColumn,
    owner: RulesetOwner,
    where: { entityIds: string[]; rulesetId: string },
  ) {
    const { table } = column;
    const named = and(inArray(column, where.entityIds), isNull(getTableColumns(table).deletedAt));
    const ownerOf = (entityType: RulesetEntityType) => {
      const entity = ENTITY_TABLES[entityType];
      return {
        columns: {
          entityType: sql<RulesetEntityType>`${entityType}::text`.as("entity_type"),
          id: entity.id,
          name: entity.name,
          targetId: sql<string>`${column}`.as("target_id"),
        },
        owned: and(named, eq(entity.rulesetId, where.rulesetId), isNull(entity.deletedAt)),
      };
    };
    if ("klassLevelId" in owner) {
      const { columns, owned } = ownerOf("klasses");
      return db
        .select(columns)
        .from(table)
        .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, owner.klassLevelId))
        .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
        .where(owned);
    }
    const entity = ENTITY_TABLES[owner.entityType];
    const { columns, owned } = ownerOf(owner.entityType);
    if (!isLink(column, owner)) return db.select(columns).from(entity).where(owned);
    return db.select(columns).from(table).innerJoin(entity, eq(entity.id, owner.id)).where(owned);
  }

  /** Whether a character on `rulesetId`, or on a ruleset built on it, names one of `ids` in `column`. */
  private async existsPick(
    db: Db,
    column: PgColumn,
    owner: CharacterOwner,
    where: { ids: string[]; rulesetId: string },
  ) {
    let query = db
      .select({ one: sql<number>`1` })
      .from(column.table)
      .$dynamic();
    if ("characterLevelId" in owner)
      query = query.innerJoin(levelsInCharacter, eq(levelsInCharacter.id, owner.characterLevelId));
    const characterId = "characterId" in owner ? owner.characterId : levelsInCharacter.characterId;
    // A character's own field (its race) needs no join
    if (column.table !== charactersInCharacter)
      query = query.innerJoin(charactersInCharacter, eq(charactersInCharacter.id, characterId));
    const rows = await query
      .innerJoin(rulesetsInRules, this.rulesetOrDescendant(charactersInCharacter.rulesetId, where.rulesetId))
      .where(inArray(column, where.ids))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Points `column`'s `from` at `to`, every row's or `rulesetId`'s rows only (`ownedBy`), leaving the rows' `updatedAt`:
   * a repoint isn't an edit. A row that would then repeat another by its table's primary key goes instead: the one
   * naming `to` already stays.
   */
  private async repoint(db: Db, { column, owner }: EntityReference, from: string, to: string, rulesetId?: string) {
    const { table } = column;
    const columns = getTableColumns(table);
    const named = and(eq(column, from), rulesetId === undefined ? undefined : this.ownedBy(db, owner, rulesetId));
    const [primaryKey] = getTableConfig(table).primaryKeys;
    if (primaryKey?.columns.some((keyColumn) => keyColumn.name === column.name)) {
      const twin = alias(table, "twin");
      const twinColumns = getTableColumns(twin);
      const twinOf = (of: Column) => twinColumns[keyOf(columns, of)];
      const sameKey = primaryKey.columns
        .filter((keyColumn) => keyColumn.name !== column.name)
        .map((keyColumn) => eq(twinOf(keyColumn), keyColumn));
      await db.delete(table).where(
        and(
          named,
          exists(
            db
              .select({ one: sql<number>`1` })
              .from(twin)
              .where(and(eq(twinOf(column), to), ...sameKey)),
          ),
        ),
      );
    }
    await db
      .update(table)
      .set({ [keyOf(columns, column)]: to })
      .where(named);
  }

  /**
   * Whether a character on `rulesetId`, or on a ruleset built on it (a fork of it, or a ruleset subscribing to it as an
   * extension), names one of `ids` of an entity type: an in-use check. Archived characters count: one can be restored,
   * and its picks must still resolve.
   */
  async exists(db: Db, where: { entityType: ReferencedType; ids: string[]; rulesetId: string }): Promise<boolean> {
    if (where.ids.length === 0) return false;
    for (const { column, owner } of ENTITY_REFERENCES[where.entityType])
      if (isCharacters(owner) && (await this.existsPick(db, column, owner, where))) return true;

    return false;
  }

  /**
   * The ids among `entityIds` that `rulesetId`'s rows name (`ownedBy`): its entities' rows and its classes' levels', and
   * its characters' and those of the characters on a ruleset built on it. What an unsubscribe points at what stands in
   * their place, each with `update`.
   */
  async findIds(db: Db, where: { entityIds: string[]; rulesetId: string }): Promise<string[]> {
    if (where.entityIds.length === 0) return [];
    const [first, second, ...rest] = Object.values(ENTITY_REFERENCES).flatMap((references) =>
      references.map(({ column, owner }) =>
        db
          .select({ id: sql<string>`${column}`.as("id") })
          .from(column.table)
          .where(and(inArray(column, where.entityIds), this.ownedBy(db, owner, where.rulesetId))),
      ),
    );
    const rows = await union(first, second, ...rest).orderBy(sql`id`);
    return rows.map((row) => row.id);
  }

  /**
   * A ruleset's rows that name one of `entityIds` (another ruleset's entities), each by the entity it's of (its type, id
   * and name) and the entity it names (`targetId`): an entity's field (an item's template, a class's or a race's parent,
   * a spell's save, a save's or a skill's ability), a link of an entity (a feat's or a spell's to a list, a class's
   * skill), and a class level's saves and grants, each its class's. What the ruleset would keep dangling were those
   * entities to leave it.
   */
  async findMany(db: Db, where: { entityIds: string[]; rulesetId: string }) {
    if (where.entityIds.length === 0) return [];
    const [first, second, ...rest] = Object.values(ENTITY_REFERENCES).flatMap((references) =>
      references.flatMap(({ column, owner }) =>
        isCharacters(owner) ? [] : [this.selectOwned(db, column, owner, where)],
      ),
    );
    return await unionAll(first, second, ...rest).orderBy(sql`entity_type, name, id, target_id`);
  }

  /**
   * Points every row naming an entity (`where.entityId`) at another of its type (`values.entityId`): a ruleset's and a
   * character's, whatever their ruleset, or one ruleset's (`rulesetId`): its entities' rows and its classes' levels',
   * and its characters' and those of the characters on a ruleset built on it. A row that would then repeat one naming
   * the other (by its table's primary key: a feat's link to a list it links to already) goes instead.
   */
  async update(
    db: Db,
    values: { entityId: string },
    where:
      | { entityId: string; entityType: ReferencedType }
      | { entityId: string; entityType: ReferencedType; rulesetId: string },
  ) {
    const rulesetId = "rulesetId" in where ? where.rulesetId : undefined;
    for (const reference of ENTITY_REFERENCES[where.entityType])
      await this.repoint(db, reference, where.entityId, values.entityId, rulesetId);
  }
}

export default EntityReferencesRepository;
