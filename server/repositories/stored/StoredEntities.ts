import { and, count, eq, inArray, isNull, notInArray, or, type SQL, sql } from "drizzle-orm";
import type { PgInsertValue } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import {
  advancementsInCharacter,
  entitiesInRules,
  entityFieldsInRules,
  entityLinksInRules,
  entitySnapshotsInRules,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { Engine, type StoredEntity, type StoredWrite } from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import { buildLineageCondition } from "@/server/repositories/rulesets/rulesetLineage.ts";

import { toQualified } from "./toQualified.ts";

/** A picker's page of a kind's entities, among `ids`, of the values of `columns` and `fields`, but `excludeIds`. */
interface OptionWhere {
  columns?: Record<string, unknown>;
  entityType: string;
  excludeIds?: string[];
  fields?: Record<string, string>;
  ids: string[];
  search?: string;
}

/** A page's bounds: the rows it reads, and those it skips. */
interface PageBounds {
  limit: number;
  offset: number;
}

/**
 * A list of a kind's entities (`entityType`): a ruleset's own, its source chain's (less what a later ruleset copied,
 * and the `hiddenIds` its copy-on-write data gives), a campaign's; those of `ids`, of the values of `columns` (each
 * column's value, or one of its values: a field's, a single link's, its partition), of the values of `fields` (a feat's
 * family), the targets of a join's links (`joinedBy`: an aptitude a feat is listed in); searched, in an order.
 */
export interface EntityListWhere {
  ancestorRulesetIds?: string[];
  campaignId?: string;
  childOnly?: boolean;
  columns?: Record<string, unknown>;
  entityType: string;
  fields?: Record<string, string>;
  hiddenIds?: string[];
  ids?: string[];
  joinedBy?: string;
  orderBy?: "createdAt" | "name" | "updatedAt";
  /** A character's (its id): the kind's entities first by the highest of theirs it advanced in (a class's levels) */
  orderByAdvancementsOf?: string;
  orderDir?: "asc" | "desc";
  rulesetId: string;
  search?: string;
}

/** A row of an entity, any kind's, as its module's declaration reads it off the stored entity. */
export type EntityRow = Record<string, unknown> & { id: string };

/** A field's text, whichever column holds it: a number's as it was written, a flag's `true` or `false`. */
const FIELD_TEXT = sql<string>`coalesce(${entityFieldsInRules.textValue}, ${entityFieldsInRules.numberValue}::text, ${entityFieldsInRules.flagValue}::text)`;

/** An entity's own columns, as a stored entity carries them. */
const OWN_COLUMNS = {
  id: entitiesInRules.id,
  type: entitiesInRules.type,
  rulesetId: entitiesInRules.rulesetId,
  campaignId: entitiesInRules.campaignId,
  name: entitiesInRules.name,
  description: entitiesInRules.description,
  ownerId: entitiesInRules.ownerId,
  position: entitiesInRules.position,
  partition: entitiesInRules.partition,
  createdAt: entitiesInRules.createdAt,
  updatedAt: entitiesInRules.updatedAt,
  deletedAt: entitiesInRules.deletedAt,
};

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/**
 * Every module's ruleset entities, as the generic tables store them (`rules.entities`, its fields in `entity_fields`,
 * its links in `entity_links`): read and written by kind (`entityType`), each row as its module's declaration reads a
 * stored entity (`Engine.storage().rowOf`), each write as it splits one (`writeOf`). A kind's list filters and orders by
 * its columns' storage, which the declaration names: nothing here is any module's.
 */
class StoredEntities extends include(BaseRepository, GuardsStaleEdits, Paginates, Searches)<typeof entitiesInRules> {
  constructor() {
    super(entitiesInRules);
  }

  /** What holds a column of a kind's rows, by its name, as its declaration stores it: a filter's, an order's. */
  private static buildColumnCondition(entityType: string, name: string, value: unknown): SQL | false {
    const values = (Array.isArray(value) ? value : [value]).map(String);
    const column = Engine.storage().kind(entityType).columns[name];
    if (!column) return inArray(sql`${entitiesInRules[name as keyof typeof OWN_COLUMNS]}::text`, values);
    switch (column.kind) {
      case "link":
        return StoredEntities.buildLinkCondition(column.role, values);
      case "owner":
        return inArray(sql`${entitiesInRules.ownerId}::text`, values);
      case "partition":
        return inArray(entitiesInRules.partition, values);
      case "position":
        return inArray(sql`${entitiesInRules.position}::text`, values);
      default:
        return StoredEntities.buildFieldCondition(column.field, values);
    }
  }

  /** The condition that an entity holds a field's value, or one of its values. */
  private static buildFieldCondition(field: string, values: string[]): SQL {
    return sql`${entitiesInRules.id} IN (SELECT ${entityFieldsInRules.entityId} FROM ${entityFieldsInRules} WHERE ${entityFieldsInRules.field} = ${field} AND ${inArray(FIELD_TEXT, values)})`;
  }

  /** The condition that an entity holds a link of a role to one of `ids`. */
  private static buildLinkCondition(role: string, ids: string[]): SQL {
    return sql`${entitiesInRules.id} IN (SELECT ${entityLinksInRules.fromId} FROM ${entityLinksInRules} WHERE ${entityLinksInRules.role} = ${role} AND ${inArray(entityLinksInRules.toId, ids)})`;
  }

  /** The conditions a list's columns and fields add: one each. */
  private static buildValueConditions(where: Pick<EntityListWhere, "columns" | "entityType" | "fields">): SQL[] {
    return [
      ...Object.entries(where.columns ?? {}).map(([name, value]) =>
        StoredEntities.buildColumnCondition(where.entityType, name, value),
      ),
      ...Object.entries(where.fields ?? {}).map(([field, value]) => StoredEntities.buildFieldCondition(field, [value])),
    ].filter((condition): condition is SQL => condition !== false);
  }

  /** A picker's conditions: a kind's live entities among `ids`, of its values, searched by name, but `excludeIds`. */
  private buildOptionConditions(where: OptionWhere): (SQL | false)[] {
    return [
      eq(entitiesInRules.type, where.entityType),
      inArray(entitiesInRules.id, where.ids),
      isNull(entitiesInRules.deletedAt),
      ...StoredEntities.buildValueConditions(where),
      this.search(where.search, [entitiesInRules.name]),
      where.excludeIds !== undefined && where.excludeIds.length > 0 && notInArray(entitiesInRules.id, where.excludeIds),
    ];
  }

  /**
   * A kind's entities in a ruleset's list: its own (a campaign's too, with one), and its source chain's (each less what
   * a later ruleset copied, and the hidden ids its copy-on-write data gives: a book's copy that lost to another book's,
   * a book's entity the ruleset's own of its name shadows).
   */
  private buildRulesetCondition(db: Db, where: Omit<EntityListWhere, "search">): SQL {
    const { ancestorRulesetIds = [], childOnly, entityType, hiddenIds } = where;
    const childOwned = and(eq(entitiesInRules.rulesetId, where.rulesetId), isNull(entitiesInRules.campaignId))!;
    if (childOnly) return childOwned;
    const inheritedClauses = ancestorRulesetIds.map((ancestorId, i) => {
      const overriddenBy = [where.rulesetId, ...ancestorRulesetIds.slice(0, i)];
      const copied = notInArray(
        entitiesInRules.id,
        db
          .select({ id: entitySnapshotsInRules.sourceEntityId })
          .from(entitySnapshotsInRules)
          .where(
            and(
              inArray(entitySnapshotsInRules.rulesetId, overriddenBy),
              eq(entitySnapshotsInRules.entityType, entityType),
            ),
          ),
      );
      return and(eq(entitiesInRules.rulesetId, ancestorId), isNull(entitiesInRules.campaignId), copied);
    });
    const hidden = hiddenIds && hiddenIds.length > 0 ? notInArray(entitiesInRules.id, hiddenIds) : undefined;
    const inherited = inheritedClauses.length > 0 ? and(or(...inheritedClauses), hidden) : undefined;
    if (where.campaignId) {
      const campaignOwned = and(
        eq(entitiesInRules.rulesetId, where.rulesetId),
        eq(entitiesInRules.campaignId, where.campaignId),
      );
      return or(childOwned, inherited, campaignOwned)!;
    }
    return inherited ? or(childOwned, inherited)! : childOwned;
  }

  /** The order of a list by a character's advancements: its entities whose owned ones it advanced in highest first. */
  private orderByAdvancements(characterId: string): SQL[] {
    return [
      this.orderBy(
        sql`COALESCE((
          SELECT MAX(owned.position)
          FROM ${entitiesInRules} owned
          JOIN ${advancementsInCharacter} ON ${advancementsInCharacter.trackId} = owned.id
          WHERE owned.owner_id = "rules"."entities"."id"
          AND ${advancementsInCharacter.characterId} = ${characterId}
          AND ${advancementsInCharacter.deletedAt} IS NULL
        ), 0)`,
        "desc",
      ),
      this.orderBy(entitiesInRules.name),
    ];
  }

  /**
   * Stored entities a condition picks (`where`), in `order`, a page of them if `page` says, each with its fields and
   * links: every one when `whole` (what a view's raw data reads, its properties among them), else those a kind's row
   * reads (`kindReads`). A page is picked by its ids first, then read whole.
   */
  private async read(
    db: Db,
    where: SQL | undefined,
    order: SQL[],
    { page, whole = false }: { page?: PageBounds; whole?: boolean } = {},
  ): Promise<StoredEntity[]> {
    const picked = page
      ? inArray(
          entitiesInRules.id,
          db
            .select({ id: entitiesInRules.id })
            .from(entitiesInRules)
            .where(where)
            .orderBy(...order)
            .limit(page.limit)
            .offset(page.offset),
        )
      : where;
    const reads = Engine.storage().kindReads();
    const id = toQualified(entitiesInRules.id);
    const fields = entityFieldsInRules;
    const links = entityLinksInRules;
    return (await db
      .select({
        ...OWN_COLUMNS,
        // An entity's fields and links in the query that reads it, their timestamps as Postgres's text
        fields: sql<StoredEntity["fields"]>`(
          SELECT coalesce(json_agg(json_build_object('field', ${fields.field}, 'ordinal', ${fields.ordinal}, 'value', ${FIELD_TEXT}, 'createdAt', ${fields.createdAt}::text, 'updatedAt', ${fields.updatedAt}::text)), '[]')
          FROM ${fields} WHERE ${fields.entityId} = ${id}${whole ? sql`` : sql` AND ${fields.ordinal} = 0 AND ${inArray(fields.field, reads.fields)}`})`,
        links: sql<StoredEntity["links"]>`(
          SELECT coalesce(json_agg(json_build_object('id', ${links.id}, 'role', ${links.role}, 'toId', ${links.toId}, 'toType', ${links.toType}, 'viaId', ${links.viaId}, 'tier', ${links.tier}, 'amount', ${links.amount}, 'free', ${links.free}, 'ordinal', ${links.ordinal}, 'createdAt', ${links.createdAt}::text, 'updatedAt', ${links.updatedAt}::text)), '[]')
          FROM ${links} WHERE ${links.fromId} = ${id}${whole ? sql`` : sql` AND ${inArray(links.role, reads.roles)}`})`,
      })
      .from(entitiesInRules)
      .where(picked)
      .orderBy(...order)) as StoredEntity[];
  }

  /** Entities by id, as their kinds' rows, in the order of `ids`, archived or not. */
  private async readRows<R extends EntityRow = EntityRow>(db: Db, ids: string[]): Promise<R[]> {
    if (ids.length === 0) return [];
    const entities = await this.read(db, inArray(entitiesInRules.id, ids), [this.orderBy(entitiesInRules.id)]);
    const byId = new Map(entities.map((entity) => [entity.id, Engine.storage().rowOf(entity) as R]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /** Stored entities as their kinds' rows, with their lists and the entities those name (a list's read). */
  private async rowsWithLists<R extends EntityRow>(db: Db, entities: StoredEntity[]): Promise<R[]> {
    const storage = Engine.storage();
    const listed = entities.filter((entity) => storage.kind(entity.type).lists);
    const targetIds = [...new Set(listed.flatMap((entity) => entity.links.map((link) => link.toId)))];
    const targets =
      targetIds.length === 0
        ? []
        : await this.read(db, inArray(entitiesInRules.id, targetIds), [this.orderBy(entitiesInRules.id)]);
    const byId = new Map(targets.map((target) => [target.id, target]));
    return entities.map((entity) => storage.rowOf(entity, { targets: byId }) as R);
  }

  /**
   * Writes stored entities' fields and single links (`writes`: each entity's ids and what it sets), in batches:
   * replacing what they held of them when `replacing` (an update's; a new entity holds none).
   */
  private async writeParts(
    db: Db,
    entityType: string,
    writes: { ids: string[]; write: StoredWrite }[],
    replacing: boolean,
  ) {
    const fieldRows: PgInsertValue<typeof entityFieldsInRules>[] = [];
    const linkRows: (typeof entityLinksInRules.$inferInsert)[] = [];
    for (const { ids, write } of writes) {
      if (ids.length === 0) continue;
      if (replacing && write.fields.length > 0) {
        await db.delete(entityFieldsInRules).where(
          and(
            inArray(entityFieldsInRules.entityId, ids),
            inArray(
              entityFieldsInRules.field,
              write.fields.map((field) => field.field),
            ),
          ),
        );
      }
      if (replacing && write.links.length > 0) {
        await db.delete(entityLinksInRules).where(
          and(
            inArray(entityLinksInRules.fromId, ids),
            inArray(
              entityLinksInRules.role,
              write.links.map((link) => link.role),
            ),
          ),
        );
      }
      for (const { field, kind, value } of write.fields) {
        if (value === null) continue;
        for (const entityId of ids) {
          fieldRows.push({
            entityId,
            entityType,
            field,
            multiple: false,
            valueKind: kind,
            textValue: kind === "text" ? value : null,
            numberValue: kind === "number" ? value : null,
            flagValue: kind === "flag" ? value === "true" : null,
          });
        }
      }
      for (const { role, single, toId, toType } of write.links) {
        if (toId === null) continue;
        for (const fromId of ids) linkRows.push({ fromId, fromType: entityType, role, single, toId, toType });
      }
    }
    for (let i = 0; i < fieldRows.length; i += WRITE_BATCH)
      await db.insert(entityFieldsInRules).values(fieldRows.slice(i, i + WRITE_BATCH));
    for (let i = 0; i < linkRows.length; i += WRITE_BATCH)
      await db.insert(entityLinksInRules).values(linkRows.slice(i, i + WRITE_BATCH));
  }

  async create<R extends EntityRow = EntityRow>(db: Db, entityType: string, values: Record<string, unknown>) {
    return await this.createMany<R>(db, entityType, [values]);
  }

  /**
   * Writes a kind's new rows (`values`, each by its columns), each an entity, its fields (a column a write leaves out
   * its default, if it has one) and its single links. An owned entity takes its owner's ruleset and campaign. Answers
   * their ids, in order.
   */
  async createIds(db: Db, entityType: string, values: Record<string, unknown>[]): Promise<string[]> {
    if (values.length === 0) return [];
    const storage = Engine.storage();
    const writes = values.map((row) => storage.writeOf(entityType, row, true));
    const ownerType = storage.registries().entityTypes.find((def) => def.type === entityType)?.ownerType ?? null;
    const owners = new Map<string, { campaignId: string | null; rulesetId: string }>();
    const ownerIds = [...new Set(writes.flatMap((write) => (write.own.ownerId ? [write.own.ownerId] : [])))];
    if (ownerIds.length > 0) {
      const found = await db
        .select({
          id: entitiesInRules.id,
          rulesetId: entitiesInRules.rulesetId,
          campaignId: entitiesInRules.campaignId,
        })
        .from(entitiesInRules)
        .where(inArray(entitiesInRules.id, ownerIds));
      for (const row of found) owners.set(row.id, row);
    }
    const entityRows = writes.map(({ own }) => {
      const owner = own.ownerId ? owners.get(own.ownerId) : undefined;
      if (ownerType && !owner) throw new Error(`A ${entityType} names an owner that doesn't exist: ${own.ownerId}`);
      return {
        id: own.id,
        type: entityType,
        rulesetId: owner?.rulesetId ?? own.rulesetId!,
        campaignId: owner ? owner.campaignId : (own.campaignId ?? null),
        name: ownerType ? null : own.name!,
        description: ownerType ? null : (own.description ?? null),
        ownerId: own.ownerId ?? null,
        ownerType,
        position: own.position ?? null,
        partition: own.partition ?? "",
        createdAt: own.createdAt,
        updatedAt: own.updatedAt,
        deletedAt: own.deletedAt ?? null,
      };
    });
    const ids: string[] = [];
    for (let i = 0; i < entityRows.length; i += WRITE_BATCH) {
      const inserted = await db
        .insert(entitiesInRules)
        .values(entityRows.slice(i, i + WRITE_BATCH))
        .returning({ id: entitiesInRules.id });
      ids.push(...inserted.map((row) => row.id));
    }
    await this.writeParts(
      db,
      entityType,
      writes.map((write, index) => ({ ids: [ids[index]], write })),
      false,
    );
    return ids;
  }

  /** Writes a kind's new rows, as `createIds` does: answers them, in order. */
  async createMany<R extends EntityRow = EntityRow>(
    db: Db,
    entityType: string,
    values: Record<string, unknown>[],
  ): Promise<R[]> {
    return await this.readRows<R>(db, await this.createIds(db, entityType, values));
  }

  /** Writes an owned kind's new row (`values`, by its columns) under its owner (`ownerId`): its owner's column filled. */
  async createOwned<R extends EntityRow = EntityRow>(
    db: Db,
    entityType: string,
    ownerId: string,
    values: Record<string, unknown>,
  ) {
    return await this.create<R>(db, entityType, { ...values, [Engine.storage().ownerColumn(entityType)]: ownerId });
  }

  /**
   * Deletes an entity of a kind: its fields and links go with it, and what deleting it does to others' its roles say.
   * Answers it as it was.
   */
  async delete<R extends EntityRow = EntityRow>(db: Db, where: { entityType: string; id: string }) {
    const rows = await this.readRows<R>(db, [where.id]);
    await db
      .delete(entitiesInRules)
      .where(and(eq(entitiesInRules.type, where.entityType), eq(entitiesInRules.id, where.id)));
    return rows;
  }

  /**
   * A ruleset's list of a kind grouped by a field's value (`groupField`: a feat's family), a group a value or an entity
   * holding none: its name (its value, or the entity's), its key, how many it holds, and one of them.
   */
  async findGroupPage(
    db: Db,
    where: Omit<EntityListWhere, "columns" | "fields" | "joinedBy" | "orderBy" | "orderDir"> & { groupField: string },
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { limit, offset } = this.paginate(pagination);
    const group = entityFieldsInRules;
    const rows = await db
      .select({
        displayName: sql<string>`coalesce(min(${group.textValue}), min(${entitiesInRules.name}))`.as("display_name"),
        family: sql<string | null>`min(${group.textValue})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${entitiesInRules.id}::text)`.as("representative_id"),
      })
      .from(entitiesInRules)
      .leftJoin(group, and(eq(group.entityId, entitiesInRules.id), eq(group.field, where.groupField)))
      .where(
        this.where([
          eq(entitiesInRules.type, where.entityType),
          this.buildRulesetCondition(db, where),
          isNull(entitiesInRules.deletedAt),
          this.search(where.search, [entitiesInRules.name]),
          where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
        ]),
      )
      .groupBy(sql`coalesce(${group.textValue}, ${entitiesInRules.id}::text)`)
      // A group is a value or an entity alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(
          sql`coalesce(min(${group.textValue}), min(${entitiesInRules.name}))`,
          sql`min(${entitiesInRules.id}::text)`,
        ),
      )
      .limit(limit)
      .offset(offset);
    return this.paginated(rows, pagination);
  }

  /**
   * A ruleset's whole list of a kind (`where`, as a page's), by `order` (its name, or its id), as rows: of the rulesets
   * built on it too when `lineage` says (a fork of it, a ruleset subscribing to it), whose views read its entities (a
   * template's copies, which a change to it reaches).
   */
  async findList<R extends EntityRow = EntityRow>(
    db: Db,
    where: EntityListWhere & { lineage?: boolean; order: "id" | "name" },
  ): Promise<R[]> {
    if (where.ids !== undefined && where.ids.length === 0) return [];
    const scope = this.buildRulesetCondition(db, where);
    const lineage =
      where.lineage &&
      inArray(
        entitiesInRules.rulesetId,
        db.select({ id: rulesetsInRules.id }).from(rulesetsInRules).where(buildLineageCondition(where.rulesetId)),
      );
    const entities = await this.read(
      db,
      this.where([
        eq(entitiesInRules.type, where.entityType),
        lineage ? or(scope, lineage)! : scope,
        isNull(entitiesInRules.deletedAt),
        where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
        ...StoredEntities.buildValueConditions(where),
      ]),
      where.order === "id"
        ? [this.orderBy(entitiesInRules.id)]
        : [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
    );
    return entities.map((entity) => Engine.storage().rowOf(entity) as R);
  }

  /**
   * Live entities of a kind by id, by name; those its owners own (`ownerIds`: a class's levels, by position); or those
   * of rulesets as their views show them (`rulesetIds`): none of a campaign's.
   */
  async findMany<R extends EntityRow = EntityRow>(
    db: Db,
    where:
      | { entityType: string; ids: string[] }
      | { entityType: string; ownerIds: string[] }
      | { entityType: string; rulesetIds: string[] },
  ): Promise<R[]> {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("ownerIds" in where && where.ownerIds.length === 0) return [];
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    const entities = await this.read(
      db,
      this.branchWhere(
        [
          "ids" in where && inArray(entitiesInRules.id, where.ids),
          "ownerIds" in where && inArray(entitiesInRules.ownerId, where.ownerIds),
          "rulesetIds" in where &&
            and(inArray(entitiesInRules.rulesetId, where.rulesetIds), isNull(entitiesInRules.campaignId))!,
        ],
        [eq(entitiesInRules.type, where.entityType), isNull(entitiesInRules.deletedAt)],
      ),
      "ownerIds" in where
        ? [this.orderBy(entitiesInRules.position), this.orderBy(entitiesInRules.ownerId)]
        : [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
    );
    return entities.map((entity) => Engine.storage().rowOf(entity) as R);
  }

  /**
   * A live entity of a kind, by id or by name, in a ruleset if `rulesetId` says, owned by `ownerId` if it says (a
   * class's level).
   */
  async findOne<R extends EntityRow = EntityRow>(
    db: Db,
    where: { entityType: string; ownerId?: string; rulesetId?: string } & ({ id: string } | { name: string }),
  ): Promise<R | undefined> {
    const [entity] = await this.read(
      db,
      this.where([
        eq(entitiesInRules.type, where.entityType),
        "id" in where ? eq(entitiesInRules.id, where.id) : eq(entitiesInRules.name, where.name),
        where.rulesetId !== undefined && eq(entitiesInRules.rulesetId, where.rulesetId),
        where.ownerId !== undefined && eq(entitiesInRules.ownerId, where.ownerId),
        isNull(entitiesInRules.deletedAt),
      ]),
      [this.orderBy(entitiesInRules.id)],
      { page: { limit: 1, offset: 0 } },
    );
    return entity && (Engine.storage().rowOf(entity) as R);
  }

  /**
   * A picker's page of a kind's entities (a list's, as the ruleset composes it), a group's entities as one row (a
   * feat's family): the groups an entity is in are given (`groups`), and one in none is a row of its own.
   */
  async findOptionGroupPage(
    db: Db,
    where: OptionWhere & { groups: { group: string; id: string }[] },
    pagination: { limit: number; page: number },
  ) {
    const { limit, offset } = this.paginate(pagination);
    // Each entity's group, as one parameter: a row per entity and group
    const groups = sql`jsonb_to_recordset(${JSON.stringify(where.groups)}::jsonb) AS member(id uuid, "group" text)`;
    const groupName = sql<string | null>`member."group"`;
    const rows = await db
      .select({
        displayName:
          sql<string>`CASE WHEN count(*) = 1 THEN min(${entitiesInRules.name}) ELSE coalesce(min(${groupName}), min(${entitiesInRules.name})) END`.as(
            "display_name",
          ),
        family: sql<string | null>`min(${groupName})`.as("family"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${entitiesInRules.id}::text)`.as("representative_id"),
        description: sql<string>`min(${entitiesInRules.description})`.as("description"),
      })
      .from(entitiesInRules)
      .leftJoin(groups, sql`member.id = ${entitiesInRules.id}`)
      .where(this.where(this.buildOptionConditions(where)))
      .groupBy(sql`coalesce(${groupName}, ${entitiesInRules.id}::text)`)
      // A group is a value or an entity alone: its smallest id is its own
      .orderBy(
        ...this.pageOrder(
          sql`coalesce(min(${groupName}), min(${entitiesInRules.name}))`,
          sql`min(${entitiesInRules.id}::text)`,
        ),
      )
      .limit(limit)
      .offset(offset);
    return this.paginated(rows, pagination);
  }

  /** A picker's page of a kind's entities (a list's, as the ruleset composes it), by name: each its name and text. */
  async findOptionPage(db: Db, where: OptionWhere, pagination: { limit: number; page: number }) {
    const rows = await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name, description: entitiesInRules.description })
      .from(entitiesInRules)
      .where(this.where(this.buildOptionConditions(where)))
      .orderBy(...this.pageOrder(this.orderBy(entitiesInRules.name)))
      .limit(this.paginate(pagination).limit)
      .offset(this.paginate(pagination).offset);
    return this.paginated(rows as { description: string | null; id: string; name: string }[], pagination);
  }

  /**
   * A page of a ruleset's list of a kind (`where`), each as its kind's row with its lists (a feat's pools, each with its
   * aptitude).
   */
  async findPage<R extends EntityRow = EntityRow>(
    db: Db,
    where: EntityListWhere,
    pagination: { limit: number; page: number },
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated<R>([], pagination);
    const { search, orderBy = "name", orderDir = "asc", joinedBy } = where;
    const searchColumns = [entitiesInRules.name, entitiesInRules.description];
    const join = joinedBy === undefined ? undefined : Engine.storage().join(joinedBy);
    const conditions = [
      eq(entitiesInRules.type, where.entityType),
      this.buildRulesetCondition(db, where),
      isNull(entitiesInRules.deletedAt),
      this.fuzzySearch(search, searchColumns),
      where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
      join !== undefined &&
        sql`${entitiesInRules.id} IN (SELECT ${entityLinksInRules.toId} FROM ${entityLinksInRules} WHERE ${and(eq(entityLinksInRules.role, join.role), eq(entityLinksInRules.fromType, join.from), eq(entityLinksInRules.toType, join.to))})`,
      ...StoredEntities.buildValueConditions(where),
    ];
    const order = where.orderByAdvancementsOf
      ? this.orderByAdvancements(where.orderByAdvancementsOf)
      : [this.searchOrderBy(search, searchColumns, this.orderBy(entitiesInRules[orderBy], orderDir))];
    return await this.withPagination(pagination, async (page) =>
      this.rowsWithLists<R>(db, await this.read(db, this.where(conditions), this.pageOrder(order), { page })),
    );
  }

  /**
   * The ids a character names entities of a kind by (`entityType`, `ids`): their own, or, of a kind that owns others,
   * those of the live entities they own (a class's levels, which a character advances in).
   */
  async findPickedIds(db: Db, where: { entityType: string; ids: string[] }): Promise<string[]> {
    const ownedKinds = Engine.storage().ownedKinds(where.entityType);
    if (ownedKinds.length === 0) return where.ids;
    const owned = [];
    for (const entityType of ownedKinds) owned.push(...(await this.findMany(db, { entityType, ownerIds: where.ids })));
    return owned.map((entity) => entity.id);
  }

  /** The ids of an owner's live entities of an owned kind (`ownerId`), by their place on its track (a level's number). */
  async findPositions(db: Db, where: { entityType: string; ownerId: string }): Promise<Map<number, string>> {
    const rows = await db
      .select({ id: entitiesInRules.id, position: entitiesInRules.position })
      .from(entitiesInRules)
      .where(
        and(
          eq(entitiesInRules.type, where.entityType),
          eq(entitiesInRules.ownerId, where.ownerId),
          isNull(entitiesInRules.deletedAt),
        ),
      );
    return new Map(rows.flatMap((row) => (row.position === null ? [] : [[row.position, row.id]])));
  }

  /**
   * Entities as stored, each with its fields and links: by id (`ids`, archived or not, in no order), or a ruleset's own
   * live ones, every kind's (a campaign's too, with one), none of its sources', by name then id.
   */
  async findStored(
    db: Db,
    where: { campaignId?: string; rulesetId: string } | { ids: string[] },
  ): Promise<StoredEntity[]> {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("ids" in where) {
      return await this.read(db, inArray(entitiesInRules.id, where.ids), [this.orderBy(entitiesInRules.id)], {
        whole: true,
      });
    }
    return await this.read(
      db,
      and(
        this.buildRulesetCondition(db, { ...where, entityType: "", ancestorRulesetIds: [] }),
        isNull(entitiesInRules.deletedAt),
      ),
      [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
      { whole: true },
    );
  }

  /**
   * The ids of a ruleset's own live entities (a campaign's too, with one) that a link with a tier points at, from any
   * ruleset's entity (a spell list's spell at a level).
   */
  async findTieredIds(db: Db, where: { campaignId?: string; rulesetId: string }): Promise<Set<string>> {
    const own = db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(
        and(
          this.buildRulesetCondition(db, { ...where, entityType: "", ancestorRulesetIds: [] }),
          isNull(entitiesInRules.deletedAt),
        ),
      );
    const rows = await db
      .selectDistinct({ id: entityLinksInRules.toId })
      .from(entityLinksInRules)
      .where(and(inArray(entityLinksInRules.toId, own), sql`${entityLinksInRules.tier} IS NOT NULL`))
      .orderBy(this.orderBy(entityLinksInRules.toId));
    return new Set(rows.map((row) => row.id));
  }

  /** Whether a live entity of a kind has the id. */
  async has(db: Db, where: { entityType: string; id: string }) {
    const [entity] = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(
        and(
          eq(entitiesInRules.type, where.entityType),
          eq(entitiesInRules.id, where.id),
          isNull(entitiesInRules.deletedAt),
        ),
      )
      .limit(1);
    return entity !== undefined;
  }

  /**
   * Writes a change to a live entity of a kind (`values`: the columns it sets), if it's still the version the editor
   * read (`expectedUpdatedAt`): its own columns, its fields and its single links, its `updatedAt` moved as any change
   * moves it. Answers it as written, or nothing.
   */
  async update<R extends EntityRow = EntityRow>(
    db: Db,
    entityType: string,
    values: Record<string, unknown>,
    where: { expectedUpdatedAt?: string; id: string },
  ): Promise<R[]> {
    const write = Engine.storage().writeOf(entityType, values, false);
    const { name, description, deletedAt, campaignId, partition, position } = write.own;
    const updated = await db
      .update(entitiesInRules)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(deletedAt !== undefined && { deletedAt }),
        ...(campaignId !== undefined && { campaignId }),
        ...(partition !== undefined && { partition }),
        ...(position !== undefined && { position }),
        updatedAt: write.own.updatedAt ?? new Date().toISOString(),
      })
      .where(
        this.where([
          eq(entitiesInRules.type, entityType),
          eq(entitiesInRules.id, where.id),
          isNull(entitiesInRules.deletedAt),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning({ id: entitiesInRules.id });
    const ids = updated.map((row) => row.id);
    await this.writeParts(db, entityType, [{ ids, write }], true);
    return await this.readRows<R>(db, ids);
  }
}

export default StoredEntities;
