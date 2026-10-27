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
import {
  Engine,
  type EntityFilters,
  type EntityRecord,
  type EntityWrite,
  type FieldValue,
  type StoredEntity,
} from "@/engine/index.ts";
import { include } from "@/lib/mixins.ts";
import BaseRepository from "@/server/repositories/BaseRepository.ts";
import { GuardsStaleEdits } from "@/server/repositories/concerns/GuardsStaleEdits.ts";
import { Paginates, type Pagination } from "@/server/repositories/concerns/Paginates.ts";
import { Searches } from "@/server/repositories/concerns/Searches.ts";
import { buildLineageCondition } from "@/server/repositories/rulesets/rulesetLineage.ts";

import { toFieldRows } from "./toFieldRows.ts";
import { toQualified } from "./toQualified.ts";

/** A picker's page of a kind's entities, among `ids`, of the values of their `fields`, but `excludeIds`. */
interface OptionWhere {
  entityType: string;
  excludeIds?: string[];
  fields?: EntityFilters["fields"];
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
 * and the `hiddenIds` its copy-on-write data gives), a campaign's; those of `ids`, of the values of their fields, the
 * targets of their single links and their partition (`EntityFilters`: an item's template flag, a feat's family, a
 * race's `pc`), the targets of the links of a role from a kind (`linkedBy`: an aptitude a feat is listed in); searched,
 * in an order.
 */
export interface EntityListWhere extends EntityFilters {
  ancestorRulesetIds?: string[];
  campaignId?: string;
  childOnly?: boolean;
  entityType: string;
  hiddenIds?: string[];
  ids?: string[];
  linkedBy?: { fromType: string; role: string };
  orderBy?: "createdAt" | "name" | "updatedAt";
  /** A character's (its id): the kind's entities first by the highest of theirs it advanced in (a class's levels) */
  orderByAdvancementsOf?: string;
  orderDir?: "asc" | "desc";
  rulesetId: string;
  search?: string;
}

/** A field's value as JSON, typed by the column that holds it: a text, a number or a flag. */
const FIELD_JSON = sql`coalesce(to_json(${entityFieldsInRules.textValue}), to_json(${entityFieldsInRules.numberValue}), to_json(${entityFieldsInRules.flagValue}))`;

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
};

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/**
 * Every module's ruleset entities, as the generic tables store them (`rules.entities`, its fields in `entity_fields`,
 * its links in `entity_links`): read and written by kind (`entityType`), each as its record (`EntityRecord`: its own
 * columns, every field it holds by field, as its module declares it, `Engine.storage().fieldsOf`, its single links by
 * role), each write as its module plans it (`EntityWrite`: its fields and single links as a record holds them), a new
 * entity's partition its kind's (`partitionOf`). A kind's list filters by its fields' values, its links' targets and
 * its partition, which its module's operation names: nothing here is any module's.
 */
class StoredEntities extends include(BaseRepository, GuardsStaleEdits, Paginates, Searches)<typeof entitiesInRules> {
  constructor() {
    super(entitiesInRules);
  }

  /**
   * The condition that an entity (of `type`) holds a field's value, or one of its values (`values`), each in the column
   * its kind holds: a flag's, a number's or a text's; or, among them the value it reads without a row (its default, a
   * flag's false: `DeclaredFields.absentValueOf`), that it holds no row of it, as its answer reads it.
   */
  private static buildFieldCondition(type: string, field: string, values: readonly FieldValue[]): SQL {
    const flags = values.filter((value) => typeof value === "boolean");
    const numbers = values.filter((value) => typeof value === "number").map(String);
    const texts = values.filter((value) => typeof value === "string");
    const held = or(
      flags.length > 0 ? inArray(entityFieldsInRules.flagValue, flags) : undefined,
      numbers.length > 0 ? inArray(entityFieldsInRules.numberValue, numbers) : undefined,
      texts.length > 0 ? inArray(entityFieldsInRules.textValue, texts) : undefined,
    );
    const holds = sql`${entitiesInRules.id} IN (SELECT ${entityFieldsInRules.entityId} FROM ${entityFieldsInRules} WHERE ${entityFieldsInRules.field} = ${field} AND ${held})`;
    const absent = Engine.storage().declaredFields().absentValueOf(type, field);
    if (absent === null || !values.includes(absent)) return holds;
    const holdsNone = sql`NOT EXISTS (SELECT 1 FROM ${entityFieldsInRules} WHERE ${entityFieldsInRules.entityId} = ${entitiesInRules.id} AND ${entityFieldsInRules.field} = ${field})`;
    return sql`(${holds} OR ${holdsNone})`;
  }

  /** The condition that an entity holds a link of a role to one of `ids`. */
  private static buildLinkCondition(role: string, ids: readonly string[]): SQL {
    return sql`${entitiesInRules.id} IN (SELECT ${entityLinksInRules.fromId} FROM ${entityLinksInRules} WHERE ${entityLinksInRules.role} = ${role} AND ${inArray(entityLinksInRules.toId, [...ids])})`;
  }

  /** A list's filters' conditions (`EntityFilters`, on a kind: `entityType`): one a field, a role, the partitions. */
  private static buildValueConditions(where: EntityFilters & { entityType: string }): SQL[] {
    const { entityType, fields = {}, links = {}, partitions } = where;
    return [
      ...Object.entries(fields).map(([field, value]) =>
        StoredEntities.buildFieldCondition(entityType, field, Array.isArray(value) ? value : [value as FieldValue]),
      ),
      ...Object.entries(links).map(([role, ids]) => StoredEntities.buildLinkCondition(role, ids)),
      ...(partitions ? [inArray(entitiesInRules.partition, [...partitions])] : []),
    ];
  }

  /** A picker's conditions: a kind's entities among `ids`, of its values, searched by name, but `excludeIds`. */
  private buildOptionConditions(where: OptionWhere): (SQL | false)[] {
    return [
      eq(entitiesInRules.type, where.entityType),
      inArray(entitiesInRules.id, where.ids),
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
          JOIN ${advancementsInCharacter} ON ${advancementsInCharacter.entryId} = owned.id
          WHERE owned.owner_id = "rules"."entities"."id"
          AND ${advancementsInCharacter.characterId} = ${characterId}
        ), 0)`,
        "desc",
      ),
      this.orderBy(entitiesInRules.name),
    ];
  }

  /**
   * Records a condition picks (`where`), in `order`, a page of them if `page` says: each entity's own columns, every
   * field it holds by field, typed as stored (read as pairs of a field and a value, a set's in their stored order; a
   * set's values in their declared order: `Engine.storage().fieldsOf`), and its single links' targets by role. A page is
   * picked by its ids first, then read whole.
   */
  private async read<R>(db: Db, where: SQL | undefined, order: SQL[], page?: PageBounds): Promise<R[]> {
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
    const id = toQualified(entitiesInRules.id);
    const fields = entityFieldsInRules;
    const links = entityLinksInRules;
    const rows = await db
      .select({
        ...OWN_COLUMNS,
        // An entity's fields' values and its single links in the query that reads it
        fields: sql<[string, FieldValue][]>`(
          SELECT coalesce(json_agg(json_build_array(${fields.field}, ${FIELD_JSON}) ORDER BY ${fields.ordinal}), '[]')
          FROM ${fields} WHERE ${fields.entityId} = ${id})`,
        links: sql<EntityRecord["links"]>`(
          SELECT coalesce(json_object_agg(${links.role}, ${links.toId} ORDER BY ${links.role}), '{}')
          FROM ${links} WHERE ${links.fromId} = ${id} AND ${links.single})`,
      })
      .from(entitiesInRules)
      .where(picked)
      .orderBy(...order);
    const storage = Engine.storage();
    return rows.map((row) => ({ ...row, fields: storage.fieldsOf(row.type, row.fields) })) as R[];
  }

  /** Entities by id, as their records, in the order of `ids`. */
  private async readRecords<R extends Pick<EntityRecord, "id">>(db: Db, ids: string[]): Promise<R[]> {
    if (ids.length === 0) return [];
    const records = await this.read<R>(db, inArray(entitiesInRules.id, ids), [this.orderBy(entitiesInRules.id)]);
    const byId = new Map(records.map((record) => [record.id, record]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /**
   * Stored entities a condition picks (`where`), whole, in `order`: each with every field's values and every link,
   * what a view's raw data reads, their timestamps as Postgres's text.
   */
  private async readStored(db: Db, where: SQL | undefined, order: SQL[]): Promise<StoredEntity[]> {
    const id = toQualified(entitiesInRules.id);
    const fields = entityFieldsInRules;
    const links = entityLinksInRules;
    return (await db
      .select({
        ...OWN_COLUMNS,
        fields: sql<StoredEntity["fields"]>`(
          SELECT coalesce(json_agg(json_build_object('field', ${fields.field}, 'ordinal', ${fields.ordinal}, 'value', ${FIELD_JSON}, 'createdAt', ${fields.createdAt}::text, 'updatedAt', ${fields.updatedAt}::text)), '[]')
          FROM ${fields} WHERE ${fields.entityId} = ${id})`,
        links: sql<StoredEntity["links"]>`(
          SELECT coalesce(json_agg(json_build_object('id', ${links.id}, 'role', ${links.role}, 'toId', ${links.toId}, 'toType', ${links.toType}, 'viaId', ${links.viaId}, 'tier', ${links.tier}, 'amount', ${links.amount}, 'free', ${links.free}, 'ordinal', ${links.ordinal}, 'createdAt', ${links.createdAt}::text, 'updatedAt', ${links.updatedAt}::text)), '[]')
          FROM ${links} WHERE ${links.fromId} = ${id})`,
      })
      .from(entitiesInRules)
      .where(where)
      .orderBy(...order)) as StoredEntity[];
  }

  /**
   * Writes entities' fields and single links (`writes`: each entity's ids and what it sets, by field and by role), in
   * batches, each field as every write stores it, a seed's, a form's or an import's (`Engine.storage().writtenFields`:
   * a set's values once, no false flag, default number or empty text, the default of one always written that holds no
   * value, none whose condition doesn't hold), each value
   * in its field's column by its declaration (`toFieldRows`), a set's in its order, and each link to its role's kind:
   * replacing what they held of each it names when `replacing` (an update's; a new entity holds none). None (no value,
   * null) writes none. A copy's fields (`copied`: its source's rows, as they're stored) are written as they are.
   */
  private async writeParts(
    db: Db,
    entityType: string,
    writes: { ids: string[]; write: Pick<EntityWrite, "fields" | "links"> }[],
    replacing: boolean,
    copied = false,
  ) {
    const storage = Engine.storage();
    const fieldRows: PgInsertValue<typeof entityFieldsInRules>[] = [];
    const linkRows: (typeof entityLinksInRules.$inferInsert)[] = [];
    for (const { ids, write } of writes) {
      const given = write.fields ?? {};
      const fields = Object.entries(copied ? given : storage.writtenFields(entityType, given, !replacing));
      const links = Object.entries(write.links ?? {});
      if (ids.length === 0) continue;
      if (replacing && fields.length > 0) {
        await db.delete(entityFieldsInRules).where(
          and(
            inArray(entityFieldsInRules.entityId, ids),
            inArray(
              entityFieldsInRules.field,
              fields.map(([field]) => field),
            ),
          ),
        );
      }
      if (replacing && links.length > 0) {
        await db.delete(entityLinksInRules).where(
          and(
            inArray(entityLinksInRules.fromId, ids),
            inArray(
              entityLinksInRules.role,
              links.map(([role]) => role),
            ),
          ),
        );
      }
      for (const [field, write] of fields) {
        const rows = toFieldRows(entityType, field, write);
        for (const entityId of ids) fieldRows.push(...rows.map((row) => ({ entityId, entityType, ...row })));
      }
      for (const [role, toId] of links) {
        const def = storage.registries().linkRoles.find((held) => held.role === role && held.fromType === entityType);
        if (!def) throw new Error(`No module declares the role ${role} from ${entityType}`);
        if (toId === null || toId === undefined) continue;
        for (const fromId of ids)
          linkRows.push({ fromId, fromType: entityType, role, single: def.single, toId, toType: def.toType });
      }
    }
    for (let i = 0; i < fieldRows.length; i += WRITE_BATCH)
      await db.insert(entityFieldsInRules).values(fieldRows.slice(i, i + WRITE_BATCH));
    for (let i = 0; i < linkRows.length; i += WRITE_BATCH)
      await db.insert(entityLinksInRules).values(linkRows.slice(i, i + WRITE_BATCH));
  }

  /**
   * Writes a kind's new entity (`write`, an owned one under its owner, `ownerId`; a copy's, `copied`, as `createIds`
   * writes it): answers its record.
   */
  async create<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    entityType: string,
    write: EntityWrite,
    copied = false,
  ) {
    return await this.createMany<R>(db, entityType, [write], copied);
  }

  /**
   * Writes a kind's new entities (`writes`), each an entity, its fields (one always written it leaves out, or clears,
   * its default: `writtenFields`) and its single links, its partition its kind's default when it gives none. An owned
   * entity takes its owner's ruleset and campaign. Their fields are stored as every write stores them, but a copy's
   * (`copied`: copy-on-write's of another entity, its source's rows as they're stored), which keeps them as they are.
   * Answers their ids, in order.
   */
  async createIds(db: Db, entityType: string, writes: EntityWrite[], copied = false): Promise<string[]> {
    if (writes.length === 0) return [];
    const storage = Engine.storage();
    const ownerType = storage.registries().entityTypes.find((def) => def.type === entityType)?.ownerType ?? null;
    const owners = new Map<string, { campaignId: string | null; rulesetId: string }>();
    const ownerIds = [...new Set(writes.flatMap((write) => (write.ownerId ? [write.ownerId] : [])))];
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
    const entityRows = writes.map((write) => {
      const owner = write.ownerId ? owners.get(write.ownerId) : undefined;
      if (ownerType && !owner) throw new Error(`A ${entityType} names an owner that doesn't exist: ${write.ownerId}`);
      return {
        id: write.id,
        type: entityType,
        rulesetId: owner?.rulesetId ?? write.rulesetId!,
        campaignId: owner ? owner.campaignId : (write.campaignId ?? null),
        name: ownerType ? null : write.name!,
        description: ownerType ? null : (write.description ?? null),
        ownerId: write.ownerId ?? null,
        ownerType,
        position: write.position ?? null,
        partition: write.partition ?? storage.partitionOf(entityType),
        createdAt: write.createdAt,
        updatedAt: write.updatedAt,
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
      copied,
    );
    return ids;
  }

  /** Writes a kind's new entities (a copy's, `copied`), as `createIds` does: answers their records, in order. */
  async createMany<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    entityType: string,
    writes: EntityWrite[],
    copied = false,
  ): Promise<R[]> {
    return await this.readRecords<R>(db, await this.createIds(db, entityType, writes, copied));
  }

  /**
   * Deletes an entity of a kind: its fields and links go with it, and what deleting it does to others' its roles say.
   * Answers its record as it was.
   */
  async delete<R extends Pick<EntityRecord, "id"> = EntityRecord>(db: Db, where: { entityType: string; id: string }) {
    const rows = await this.readRecords<R>(db, [where.id]);
    await db
      .delete(entitiesInRules)
      .where(and(eq(entitiesInRules.type, where.entityType), eq(entitiesInRules.id, where.id)));
    return rows;
  }

  /**
   * A ruleset's list of a kind grouped by a field's value (`groupField`: a feat's family), a group a value or an entity
   * holding none: its name (its value, or the entity's), its value (`group`), how many it holds, and one of them.
   */
  async findGroupPage(
    db: Db,
    where: Omit<EntityListWhere, "fields" | "linkedBy" | "links" | "orderBy" | "orderDir" | "partitions"> & {
      groupField: string;
    },
    pagination: Pagination,
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated([], pagination);
    const { limit, offset } = this.paginate(pagination);
    const group = entityFieldsInRules;
    const rows = await db
      .select({
        displayName: sql<string>`coalesce(min(${group.textValue}), min(${entitiesInRules.name}))`.as("display_name"),
        group: sql<string | null>`min(${group.textValue})`.as("group"),
        variantCount: count().as("variant_count"),
        representativeId: sql<string>`min(${entitiesInRules.id}::text)`.as("representative_id"),
      })
      .from(entitiesInRules)
      .leftJoin(group, and(eq(group.entityId, entitiesInRules.id), eq(group.field, where.groupField)))
      .where(
        this.where([
          eq(entitiesInRules.type, where.entityType),
          this.buildRulesetCondition(db, where),
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
   * A ruleset's whole list of a kind (`where`, as a page's), by `order` (its name, or its id), as records: of the
   * rulesets built on it too when `lineage` says (a fork of it, a ruleset subscribing to it), whose views read its
   * entities (a template's copies, which a change to it reaches).
   */
  async findList<R extends Pick<EntityRecord, "id"> = EntityRecord>(
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
    return await this.read<R>(
      db,
      this.where([
        eq(entitiesInRules.type, where.entityType),
        lineage ? or(scope, lineage)! : scope,
        where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
        ...StoredEntities.buildValueConditions(where),
      ]),
      where.order === "id"
        ? [this.orderBy(entitiesInRules.id)]
        : [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
    );
  }

  /**
   * Entities of a kind by id, by name; those its owners own (`ownerIds`: a class's levels, by position); or those
   * of rulesets as their views show them (`rulesetIds`): none of a campaign's.
   */
  async findMany<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    where:
      | { entityType: string; ids: string[] }
      | { entityType: string; ownerIds: string[] }
      | { entityType: string; rulesetIds: string[] },
  ): Promise<R[]> {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("ownerIds" in where && where.ownerIds.length === 0) return [];
    if ("rulesetIds" in where && where.rulesetIds.length === 0) return [];
    return await this.read<R>(
      db,
      this.branchWhere(
        [
          "ids" in where && inArray(entitiesInRules.id, where.ids),
          "ownerIds" in where && inArray(entitiesInRules.ownerId, where.ownerIds),
          "rulesetIds" in where &&
            and(inArray(entitiesInRules.rulesetId, where.rulesetIds), isNull(entitiesInRules.campaignId))!,
        ],
        [eq(entitiesInRules.type, where.entityType)],
      ),
      "ownerIds" in where
        ? [this.orderBy(entitiesInRules.position), this.orderBy(entitiesInRules.ownerId)]
        : [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
    );
  }

  /**
   * An entity of a kind, by id or by name, in a ruleset if `rulesetId` says, owned by `ownerId` if it says (a
   * class's level).
   */
  async findOne<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    where: { entityType: string; ownerId?: string; rulesetId?: string } & ({ id: string } | { name: string }),
  ): Promise<R | undefined> {
    const [entity] = await this.read<R>(
      db,
      this.where([
        eq(entitiesInRules.type, where.entityType),
        "id" in where ? eq(entitiesInRules.id, where.id) : eq(entitiesInRules.name, where.name),
        where.rulesetId !== undefined && eq(entitiesInRules.rulesetId, where.rulesetId),
        where.ownerId !== undefined && eq(entitiesInRules.ownerId, where.ownerId),
      ]),
      [this.orderBy(entitiesInRules.id)],
      { limit: 1, offset: 0 },
    );
    return entity;
  }

  /**
   * A picker's page of a kind's entities (a list's, as the ruleset composes it), a group's entities as one row (a
   * feat's family): the groups an entity is in are given (`groups`), and one in none is a row of its own.
   */
  async findOptionGroupPage(
    db: Db,
    where: OptionWhere & { groups: { group: string; id: string }[] },
    pagination: Pagination,
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
        group: sql<string | null>`min(${groupName})`.as("group"),
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
  async findOptionPage(db: Db, where: OptionWhere, pagination: Pagination) {
    const rows = await db
      .select({ id: entitiesInRules.id, name: entitiesInRules.name, description: entitiesInRules.description })
      .from(entitiesInRules)
      .where(this.where(this.buildOptionConditions(where)))
      .orderBy(...this.pageOrder(this.orderBy(entitiesInRules.name)))
      .limit(this.paginate(pagination).limit)
      .offset(this.paginate(pagination).offset);
    return this.paginated(rows as { description: string | null; id: string; name: string }[], pagination);
  }

  /** A page of a ruleset's list of a kind (`where`), each as its record. */
  async findPage<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    where: EntityListWhere,
    pagination: Pagination,
  ) {
    if (where.ids !== undefined && where.ids.length === 0) return this.paginated<R>([], pagination);
    const { search, orderBy = "name", orderDir = "asc", linkedBy } = where;
    const searchColumns = [entitiesInRules.name, entitiesInRules.description];
    const conditions = [
      eq(entitiesInRules.type, where.entityType),
      this.buildRulesetCondition(db, where),
      this.fuzzySearch(search, searchColumns),
      where.ids !== undefined && inArray(entitiesInRules.id, where.ids),
      linkedBy !== undefined &&
        sql`${entitiesInRules.id} IN (SELECT ${entityLinksInRules.toId} FROM ${entityLinksInRules} WHERE ${and(eq(entityLinksInRules.role, linkedBy.role), eq(entityLinksInRules.fromType, linkedBy.fromType), eq(entityLinksInRules.toType, where.entityType))})`,
      ...StoredEntities.buildValueConditions(where),
    ];
    const order = where.orderByAdvancementsOf
      ? this.orderByAdvancements(where.orderByAdvancementsOf)
      : [this.searchOrderBy(search, searchColumns, this.orderBy(entitiesInRules[orderBy], orderDir))];
    return await this.withPagination(
      pagination,
      async (page) => await this.read<R>(db, this.where(conditions), this.pageOrder(order), page),
    );
  }

  /**
   * The ids a character names entities of a kind by (`entityType`, `ids`): their own, or, of a kind that owns others,
   * those of the entities they own (a class's levels, which a character advances in).
   */
  async findPickedIds(db: Db, where: { entityType: string; ids: string[] }): Promise<string[]> {
    const ownedKinds = Engine.storage().ownedKinds(where.entityType);
    if (ownedKinds.length === 0) return where.ids;
    const owned = [];
    for (const entityType of ownedKinds) owned.push(...(await this.findMany(db, { entityType, ownerIds: where.ids })));
    return owned.map((entity) => entity.id);
  }

  /**
   * Entities of an owned kind, each with its owner and its place on its track (a level's number): by id (`ids`), or
   * those its owners own (`ownerIds`), by owner, then place.
   */
  async findPositions(
    db: Db,
    where: { entityType: string } & ({ ids: string[] } | { ownerIds: string[] }),
  ): Promise<{ id: string; ownerId: string; position: number }[]> {
    const ids = "ids" in where ? where.ids : where.ownerIds;
    if (ids.length === 0) return [];
    const rows = await db
      .select({ id: entitiesInRules.id, ownerId: entitiesInRules.ownerId, position: entitiesInRules.position })
      .from(entitiesInRules)
      .where(
        and(
          eq(entitiesInRules.type, where.entityType),
          inArray("ids" in where ? entitiesInRules.id : entitiesInRules.ownerId, ids),
        ),
      )
      .orderBy(
        this.orderBy(entitiesInRules.ownerId),
        this.orderBy(entitiesInRules.position),
        this.orderBy(entitiesInRules.id),
      );
    return rows.flatMap(({ id, ownerId, position }) =>
      ownerId === null || position === null ? [] : [{ id, ownerId, position }],
    );
  }

  /**
   * Entities as stored, each with its fields and links: by id (`ids`, in no order), or a ruleset's own, every kind's (a
   * campaign's too, with one), none of its sources', by name then id.
   */
  async findStored(
    db: Db,
    where: { campaignId?: string; rulesetId: string } | { ids: string[] },
  ): Promise<StoredEntity[]> {
    if ("ids" in where && where.ids.length === 0) return [];
    if ("ids" in where)
      return await this.readStored(db, inArray(entitiesInRules.id, where.ids), [this.orderBy(entitiesInRules.id)]);

    return await this.readStored(
      db,
      this.buildRulesetCondition(db, { ...where, entityType: "", ancestorRulesetIds: [] }),
      [this.orderBy(entitiesInRules.name), this.orderBy(entitiesInRules.id)],
    );
  }

  /**
   * The ids of a ruleset's own entities (a campaign's too, with one) that a link with a tier points at, from any
   * ruleset's entity (a spell list's spell at a level).
   */
  async findTieredIds(db: Db, where: { campaignId?: string; rulesetId: string }): Promise<Set<string>> {
    const own = db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(this.buildRulesetCondition(db, { ...where, entityType: "", ancestorRulesetIds: [] }));
    const rows = await db
      .selectDistinct({ id: entityLinksInRules.toId })
      .from(entityLinksInRules)
      .where(and(inArray(entityLinksInRules.toId, own), sql`${entityLinksInRules.tier} IS NOT NULL`))
      .orderBy(this.orderBy(entityLinksInRules.toId));
    return new Set(rows.map((row) => row.id));
  }

  /** Whether an entity of a kind has the id. */
  async has(db: Db, where: { entityType: string; id: string }) {
    const [entity] = await db
      .select({ id: entitiesInRules.id })
      .from(entitiesInRules)
      .where(and(eq(entitiesInRules.type, where.entityType), eq(entitiesInRules.id, where.id)))
      .limit(1);
    return entity !== undefined;
  }

  /**
   * Writes a change to an entity of a kind (`write`: the own columns, fields and single links it sets; a field always
   * written it clears, its default), if it's still the version the editor read (`expectedUpdatedAt`), its `updatedAt`
   * moved as any change moves it. Answers its record as written, or nothing.
   */
  async update<R extends Pick<EntityRecord, "id"> = EntityRecord>(
    db: Db,
    entityType: string,
    write: EntityWrite,
    where: { expectedUpdatedAt?: string; id: string },
  ): Promise<R[]> {
    const { name, description, campaignId, partition, position } = write;
    const updated = await db
      .update(entitiesInRules)
      .set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(campaignId !== undefined && { campaignId }),
        ...(partition !== undefined && { partition }),
        ...(position !== undefined && { position }),
        updatedAt: write.updatedAt ?? new Date().toISOString(),
      })
      .where(
        this.where([
          eq(entitiesInRules.type, entityType),
          eq(entitiesInRules.id, where.id),
          this.casUpdatedAt(where.expectedUpdatedAt),
        ]),
      )
      .returning({ id: entitiesInRules.id });
    const ids = updated.map((row) => row.id);
    await this.writeParts(db, entityType, [{ ids, write }], true);
    return await this.readRecords<R>(db, ids);
  }
}

export default StoredEntities;
