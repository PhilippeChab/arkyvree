import { and, eq, inArray, max, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  entityFieldsInRules,
  entityLinksInRules,
  rulesetFieldsInRules,
  rulesetLinksInRules,
} from "@/drizzle/schema.ts";
import { Engine, type FieldValue, type StoredRuleset } from "@/engine/index.ts";
import type { Property } from "@/shared/relations.ts";

/** A property to write: its owner, its type (the field) and its value as text. */
export interface FieldValues {
  entityId: string;
  entityType: string;
  type: string;
  value: string;
}

/** The fields every kind's columns hold (a class's hit die), which its row reads, not its properties. */
function columnFields(): string[] {
  const storage = Engine.storage();
  return storage
    .registries()
    .entityTypes.flatMap(({ type }) =>
      Object.values(storage.kind(type).columns).flatMap((column) => ("field" in column ? [column.field] : [])),
    );
}

/** How two texts sort by their characters' codes, as the database's collation (C) orders text. */
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A field's rows' value, typed by the column that holds it: a text, a number or a flag. */
function valueOf(table: typeof entityFieldsInRules | typeof rulesetFieldsInRules) {
  return sql<FieldValue>`coalesce(to_json(${table.textValue}), to_json(${table.numberValue}), to_json(${table.flagValue}))`;
}

/**
 * An entity's and a ruleset's properties, as a copy still copies them and a save still writes them: the fields their
 * module declares beside their kind's columns (a feat's family, a spell's school, a ruleset's feat advancement), and
 * those whose value names an entity, which are links (a class's bonus spell ability, a ruleset's skill point ability).
 * Read as their stored fields and links, each value as text (`findMany`), and written from properties, each value typed
 * by its field's declaration (`rules.entity_fields`, `ruleset_fields`) or a link (`entity_links`, `ruleset_links`).
 */
class StoredProperties {
  /**
   * The properties of owners' stored fields and links (`owners`, each of its type), each value as text, and the
   * entities the properties a link holds name: in the order they were written, by owner, type and value; of
   * `entityType` and of `type` when given.
   */
  private static propertiesOf(
    owners: (Pick<StoredRuleset, "fields" | "id" | "links"> & { type: string })[],
    where: { entityType?: string; type?: string },
  ): Property[] {
    const storage = Engine.storage();
    const rows: {
      createdAt: string;
      entityId: string;
      entityType: string;
      ordinal: number;
      type: string;
      updatedAt: string;
      value: string;
    }[] = [];
    for (const { fields, id: entityId, links, type: entityType } of owners) {
      rows.push(
        ...fields.map((field) => ({ ...field, entityId, entityType, type: field.field, value: String(field.value) })),
      );
      for (const [type, role] of storage.linkedProperties(entityType)) {
        const linked = links.filter((link) => link.role === role);
        rows.push(...linked.map((link) => ({ ...link, entityId, entityType, ordinal: 0, type, value: link.toId })));
      }
    }
    return rows
      .filter(
        (row) => (!where.entityType || row.entityType === where.entityType) && (!where.type || row.type === where.type),
      )
      .sort(
        (a, b) =>
          compareText(a.createdAt, b.createdAt) ||
          compareText(a.entityId, b.entityId) ||
          compareText(a.type, b.type) ||
          compareText(a.value, b.value),
      )
      .map((row) => ({
        // In the order a property's answer gives its columns
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: null,
        id: `${row.entityId}:${row.type}:${row.ordinal}`,
        entityId: row.entityId,
        entityType: row.entityType,
        value: row.value,
        type: row.type,
        description: null,
      }));
  }

  /** A field's value of a declared kind, from its text: a number parsed, a flag `true` or not. */
  private static typed(value: FieldValues) {
    const def = Engine.storage().field(value.entityType, value.type);
    if (!def) throw new Error(`No module declares the field ${value.type} of ${value.entityType}`);
    if (def.valueKind === "number" && !Number.isFinite(Number(value.value)))
      throw new Error(`${value.type} holds a number: ${value.value} isn't one`);
    return {
      def,
      row: {
        field: value.type,
        valueKind: def.valueKind,
        multiple: def.multiple,
        textValue: def.valueKind === "text" ? value.value : null,
        numberValue: def.valueKind === "number" ? value.value : null,
        flagValue: def.valueKind === "flag" ? value.value === "true" : null,
      },
    };
  }

  /** The ordinal each new value of a set takes (after the entity's last), or 0 for a single value. */
  private static async nextOrdinals(db: Db, values: FieldValues[]) {
    const idsOf = (rulesets: boolean) => [
      ...new Set(
        values.filter((value) => (value.entityType === "rulesets") === rulesets).map((value) => value.entityId),
      ),
    ];
    const entityIds = idsOf(false);
    const rulesetIds = idsOf(true);
    const entities =
      entityIds.length === 0
        ? []
        : await db
            .select({
              id: entityFieldsInRules.entityId,
              field: entityFieldsInRules.field,
              last: max(entityFieldsInRules.ordinal),
            })
            .from(entityFieldsInRules)
            .where(inArray(entityFieldsInRules.entityId, entityIds))
            .groupBy(entityFieldsInRules.entityId, entityFieldsInRules.field);
    const rulesets =
      rulesetIds.length === 0
        ? []
        : await db
            .select({
              id: rulesetFieldsInRules.rulesetId,
              field: rulesetFieldsInRules.field,
              last: max(rulesetFieldsInRules.ordinal),
            })
            .from(rulesetFieldsInRules)
            .where(inArray(rulesetFieldsInRules.rulesetId, rulesetIds))
            .groupBy(rulesetFieldsInRules.rulesetId, rulesetFieldsInRules.field);
    return new Map([...entities, ...rulesets].map((row) => [`${row.id}:${row.field}`, (row.last ?? -1) + 1]));
  }

  /** Entities' stored fields and links (`entityIds`, of `entityType` if given), as the engine reads properties off. */
  private static async readEntities(db: Db, where: { entityIds: string[]; entityType?: string }) {
    const { entityIds, entityType } = where;
    const fields = await db
      .select({
        entityId: entityFieldsInRules.entityId,
        entityType: entityFieldsInRules.entityType,
        field: entityFieldsInRules.field,
        ordinal: entityFieldsInRules.ordinal,
        value: valueOf(entityFieldsInRules),
        createdAt: entityFieldsInRules.createdAt,
        updatedAt: entityFieldsInRules.updatedAt,
      })
      .from(entityFieldsInRules)
      .where(
        and(
          inArray(entityFieldsInRules.entityId, entityIds),
          entityType ? eq(entityFieldsInRules.entityType, entityType) : undefined,
          notInArray(entityFieldsInRules.field, columnFields()),
        ),
      );
    // The roles whose links hold a property: the kind's, or every kind's
    const types = entityType
      ? [entityType]
      : Engine.storage()
          .registries()
          .entityTypes.map(({ type }) => type);
    const linkedRoles = [
      ...new Set(
        types.flatMap((type) =>
          Engine.storage()
            .linkedProperties(type)
            .map(([, role]) => role),
        ),
      ),
    ];
    const links =
      linkedRoles.length === 0
        ? []
        : await db
            .select({
              fromId: entityLinksInRules.fromId,
              fromType: entityLinksInRules.fromType,
              id: entityLinksInRules.id,
              role: entityLinksInRules.role,
              toId: entityLinksInRules.toId,
              toType: entityLinksInRules.toType,
              viaId: entityLinksInRules.viaId,
              tier: entityLinksInRules.tier,
              amount: entityLinksInRules.amount,
              free: entityLinksInRules.free,
              ordinal: entityLinksInRules.ordinal,
              createdAt: entityLinksInRules.createdAt,
              updatedAt: entityLinksInRules.updatedAt,
            })
            .from(entityLinksInRules)
            .where(
              and(
                inArray(entityLinksInRules.fromId, entityIds),
                entityType ? eq(entityLinksInRules.fromType, entityType) : undefined,
                inArray(entityLinksInRules.role, linkedRoles),
              ),
            );
    const owners = new Map<string, { fields: typeof fields; id: string; links: typeof links; type: string }>();
    const ownerOf = (id: string, type: string) => {
      const owner = owners.get(id) ?? { fields: [], id, links: [], type };
      owners.set(id, owner);
      return owner;
    };
    for (const field of fields) ownerOf(field.entityId, field.entityType).fields.push(field);
    for (const link of links) ownerOf(link.fromId, link.fromType).links.push(link);
    return [...owners.values()];
  }

  /**
   * Writes properties (`values`): each a field's value (a set's after its last) or, for a property a link holds, the
   * link to the entity it names.
   */
  async createMany(db: Db, values: FieldValues[]) {
    if (values.length === 0) return;
    const storage = Engine.storage();
    const linked = values.filter((value) => storage.linkedProperty(value.entityType, value.type));
    const fields = values.filter((value) => !storage.linkedProperty(value.entityType, value.type));

    const next = await StoredProperties.nextOrdinals(db, fields);
    const entityRows: (typeof entityFieldsInRules.$inferInsert)[] = [];
    const rulesetRows: (typeof rulesetFieldsInRules.$inferInsert)[] = [];
    for (const value of fields) {
      const { def, row } = StoredProperties.typed(value);
      const key = `${value.entityId}:${value.type}`;
      const ordinal = def.multiple ? (next.get(key) ?? 0) : 0;
      next.set(key, ordinal + 1);
      if (value.entityType === "rulesets") rulesetRows.push({ ...row, rulesetId: value.entityId, ordinal });
      else entityRows.push({ ...row, entityId: value.entityId, entityType: value.entityType, ordinal });
    }
    for (let i = 0; i < entityRows.length; i += 2000)
      await db.insert(entityFieldsInRules).values(entityRows.slice(i, i + 2000));
    for (let i = 0; i < rulesetRows.length; i += 2000)
      await db.insert(rulesetFieldsInRules).values(rulesetRows.slice(i, i + 2000));

    for (const value of linked) {
      const role = storage.linkedProperty(value.entityType, value.type)!;
      const toId = value.value.toLowerCase();
      if (value.entityType === "rulesets") {
        const def = storage.registries().rulesetRoles.find((ruleset) => ruleset.role === role)!;
        await db.insert(rulesetLinksInRules).values({ rulesetId: value.entityId, role, toId, toType: def.toType });
      } else {
        const def = storage
          .registries()
          .linkRoles.find((link) => link.role === role && link.fromType === value.entityType)!;
        await db.insert(entityLinksInRules).values({
          fromId: value.entityId,
          fromType: value.entityType,
          role,
          single: def.single,
          toId,
          toType: def.toType,
        });
      }
    }
  }

  /** Removes the properties of entities of a type (`entityIds`, `entityType`): those of `types`, or every one. */
  async delete(db: Db, where: { entityIds: string[]; entityType: string; types?: readonly string[] }) {
    if (!where.entityIds) throw new Error("StoredProperties: a where that matches none of its branches");
    if (where.entityIds.length === 0) return;
    const storage = Engine.storage();
    const linked = storage
      .linkedProperties(where.entityType)
      .filter(([type]) => !where.types || where.types.includes(type));
    const fieldTypes = where.types?.filter((type) => !storage.linkedProperty(where.entityType, type));
    if (where.entityType === "rulesets") {
      await db
        .delete(rulesetFieldsInRules)
        .where(
          and(
            inArray(rulesetFieldsInRules.rulesetId, where.entityIds),
            fieldTypes ? inArray(rulesetFieldsInRules.field, fieldTypes) : undefined,
          ),
        );
      if (linked.length > 0) {
        await db.delete(rulesetLinksInRules).where(
          and(
            inArray(rulesetLinksInRules.rulesetId, where.entityIds),
            inArray(
              rulesetLinksInRules.role,
              linked.map(([, role]) => role),
            ),
          ),
        );
      }
      return;
    }
    if (!fieldTypes || fieldTypes.length > 0) {
      await db
        .delete(entityFieldsInRules)
        .where(
          and(
            inArray(entityFieldsInRules.entityId, where.entityIds),
            eq(entityFieldsInRules.entityType, where.entityType),
            fieldTypes
              ? inArray(entityFieldsInRules.field, fieldTypes)
              : notInArray(entityFieldsInRules.field, columnFields()),
          ),
        );
    }
    if (linked.length > 0) {
      await db.delete(entityLinksInRules).where(
        and(
          inArray(entityLinksInRules.fromId, where.entityIds),
          inArray(
            entityLinksInRules.role,
            linked.map(([, role]) => role),
          ),
        ),
      );
    }
  }

  /**
   * The properties of entities (`entityIds`, of `entityType` if given, of `type` if given), a ruleset's among them, in
   * the order they were written: their fields' values, a set's by value, and the entities their links name.
   */
  async findMany(
    db: Db,
    where:
      | { entityIds: string[]; entityType: string }
      | { entityIds: string[]; entityType: string; type: string }
      | { entityIds: string[] },
  ): Promise<Property[]> {
    if (!where.entityIds) throw new Error("StoredProperties: a where that matches none of its branches");
    if (where.entityIds.length === 0) return [];
    const entityType = "entityType" in where ? where.entityType : undefined;
    const entities =
      entityType === "rulesets"
        ? []
        : await StoredProperties.readEntities(db, { entityIds: where.entityIds, entityType });
    const rulesets =
      !entityType || entityType === "rulesets" ? await this.findRulesets(db, { ids: where.entityIds }) : [];
    return StoredProperties.propertiesOf(
      [...entities, ...rulesets.map((ruleset) => ({ ...ruleset, type: "rulesets" }))],
      { entityType, type: "type" in where ? where.type : undefined },
    );
  }

  /** Rulesets' own settings as stored (`ids`): their fields' values and their links. */
  async findRulesets(db: Db, where: { ids: string[] }): Promise<StoredRuleset[]> {
    if (where.ids.length === 0) return [];
    const fields = await db
      .select({
        rulesetId: rulesetFieldsInRules.rulesetId,
        field: rulesetFieldsInRules.field,
        ordinal: rulesetFieldsInRules.ordinal,
        value: valueOf(rulesetFieldsInRules),
        createdAt: rulesetFieldsInRules.createdAt,
        updatedAt: rulesetFieldsInRules.updatedAt,
      })
      .from(rulesetFieldsInRules)
      .where(inArray(rulesetFieldsInRules.rulesetId, where.ids));
    const links = await db
      .select({
        rulesetId: rulesetLinksInRules.rulesetId,
        role: rulesetLinksInRules.role,
        toId: rulesetLinksInRules.toId,
        createdAt: rulesetLinksInRules.createdAt,
        updatedAt: rulesetLinksInRules.updatedAt,
      })
      .from(rulesetLinksInRules)
      .where(inArray(rulesetLinksInRules.rulesetId, where.ids));
    return where.ids
      .map((id) => ({
        id,
        fields: fields.filter((field) => field.rulesetId === id).map(({ rulesetId: _, ...field }) => field),
        links: links.filter((link) => link.rulesetId === id).map(({ rulesetId: _, ...link }) => link),
      }))
      .filter((ruleset) => ruleset.fields.length > 0 || ruleset.links.length > 0);
  }
}

export default StoredProperties;
