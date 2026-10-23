import { and, eq, inArray, max, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  entityFieldsInRules,
  entityLinksInRules,
  rulesetFieldsInRules,
  rulesetLinksInRules,
} from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Property } from "@/shared/relations.ts";

/** Which properties a read is of: its owners', of a type of owner, of a property type. */
interface PropertiesWhere {
  entityIds: string[];
  entityType?: string;
  type?: string;
}

/** A property's row, as its field's or its link's row reads: its owner, its type, its value, its place in a set. */
interface PropertyRow {
  createdAt: string;
  entityId: string;
  entityType: string;
  ordinal: number;
  type: string;
  updatedAt: string;
  value: string;
}

/** A field's value to write, as a property gave it: its owner, its type (the field) and its value as text. */
export interface FieldValues {
  entityId: string;
  entityType: string;
  type: string;
  value: string;
}

/** The fields a kind's columns hold (a class's hit die), which its row reads, not its properties. */
function columnFields(): string[] {
  const storage = Engine.storage();
  const kinds = storage.registries().entityTypes.map((def) => def.type);
  return kinds.flatMap((type) =>
    Object.values(storage.kind(type).columns).flatMap((column) => ("field" in column ? [column.field] : [])),
  );
}

/** A property's row, as its field's or its link's row reads. */
function propertyOf(row: PropertyRow): Property {
  // In the order a property's answer gives its columns
  return {
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: null,
    id: `${row.entityId}:${row.type}:${row.ordinal}`,
    entityId: row.entityId,
    entityType: row.entityType,
    value: row.value,
    type: row.type,
    description: null,
  };
}

/** A field's rows' text value, whichever kind holds it: a number's as it was written, a flag's `true` or `false`. */
function textOf(table: typeof entityFieldsInRules | typeof rulesetFieldsInRules) {
  return sql<string>`coalesce(${table.textValue}, ${table.numberValue}::text, ${table.flagValue}::text)`;
}

/**
 * An entity's and a ruleset's fields that their properties were (a feat's family, a spell's school, a ruleset's feat
 * advancement), read and written as properties (`Property`: its owner, its type, its value as text), which the engine
 * reads: `rules.entity_fields` and `rules.ruleset_fields`, each value typed by its field's declaration, and the
 * properties whose value names an entity, which are links (`entity_links`, `ruleset_links`: a class's bonus spell
 * ability, a ruleset's skill point ability). A kind's columns' fields aren't properties: its row reads them.
 */
export default class StoredFields {
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

  /** The entities' properties (`where`): their fields', and the entities their links name. */
  private static async findEntityRows(db: Db, where: PropertiesWhere): Promise<PropertyRow[]> {
    const storage = Engine.storage();
    const { entityIds, entityType, type } = where;
    const rows: PropertyRow[] = [];
    rows.push(
      ...(await db
        .select({
          entityId: entityFieldsInRules.entityId,
          entityType: entityFieldsInRules.entityType,
          type: entityFieldsInRules.field,
          value: textOf(entityFieldsInRules),
          ordinal: entityFieldsInRules.ordinal,
          createdAt: entityFieldsInRules.createdAt,
          updatedAt: entityFieldsInRules.updatedAt,
        })
        .from(entityFieldsInRules)
        .where(
          and(
            inArray(entityFieldsInRules.entityId, entityIds),
            entityType ? eq(entityFieldsInRules.entityType, entityType) : undefined,
            type ? eq(entityFieldsInRules.field, type) : notInArray(entityFieldsInRules.field, columnFields()),
          ),
        )),
    );
    const linkedRoles = storage
      .registries()
      .entityTypes.flatMap((def) =>
        storage.linkedProperties(def.type).map(([propertyType, role]) => ({ fromType: def.type, propertyType, role })),
      )
      .filter((linked) => (!entityType || linked.fromType === entityType) && (!type || linked.propertyType === type));
    for (const linked of linkedRoles) {
      rows.push(
        ...(
          await db
            .select({
              entityId: entityLinksInRules.fromId,
              entityType: entityLinksInRules.fromType,
              value: sql<string>`${entityLinksInRules.toId}::text`,
              createdAt: entityLinksInRules.createdAt,
              updatedAt: entityLinksInRules.updatedAt,
            })
            .from(entityLinksInRules)
            .where(
              and(
                inArray(entityLinksInRules.fromId, entityIds),
                eq(entityLinksInRules.fromType, linked.fromType),
                eq(entityLinksInRules.role, linked.role),
              ),
            )
        ).map((row) => ({ ...row, type: linked.propertyType, ordinal: 0 })),
      );
    }
    return rows;
  }

  /** The rulesets' properties (`where`): their fields', and the entities their links name. */
  private static async findRulesetRows(db: Db, where: PropertiesWhere): Promise<PropertyRow[]> {
    const storage = Engine.storage();
    const { entityIds, type } = where;
    const rows: PropertyRow[] = [];
    rows.push(
      ...(
        await db
          .select({
            entityId: rulesetFieldsInRules.rulesetId,
            type: rulesetFieldsInRules.field,
            value: textOf(rulesetFieldsInRules),
            ordinal: rulesetFieldsInRules.ordinal,
            createdAt: rulesetFieldsInRules.createdAt,
            updatedAt: rulesetFieldsInRules.updatedAt,
          })
          .from(rulesetFieldsInRules)
          .where(
            and(
              inArray(rulesetFieldsInRules.rulesetId, entityIds),
              type ? eq(rulesetFieldsInRules.field, type) : undefined,
            ),
          )
      ).map((row) => ({ ...row, entityType: "rulesets" })),
    );
    for (const [propertyType, role] of storage.linkedProperties("rulesets")) {
      if (type && type !== propertyType) continue;
      rows.push(
        ...(
          await db
            .select({
              entityId: rulesetLinksInRules.rulesetId,
              value: sql<string>`${rulesetLinksInRules.toId}::text`,
              createdAt: rulesetLinksInRules.createdAt,
              updatedAt: rulesetLinksInRules.updatedAt,
            })
            .from(rulesetLinksInRules)
            .where(and(inArray(rulesetLinksInRules.rulesetId, entityIds), eq(rulesetLinksInRules.role, role)))
        ).map((row) => ({ ...row, entityType: "rulesets", type: propertyType, ordinal: 0 })),
      );
    }
    return rows;
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

  /**
   * Writes properties (`values`): each a field's value (a set's after its last) or, for a property a link holds, the
   * link to the entity it names.
   */
  static async createMany(db: Db, values: FieldValues[]) {
    if (values.length === 0) return;
    const storage = Engine.storage();
    const linked = values.filter((value) => storage.linkedProperty(value.entityType, value.type));
    const fields = values.filter((value) => !storage.linkedProperty(value.entityType, value.type));

    const next = await StoredFields.nextOrdinals(db, fields);
    const entityRows: (typeof entityFieldsInRules.$inferInsert)[] = [];
    const rulesetRows: (typeof rulesetFieldsInRules.$inferInsert)[] = [];
    for (const value of fields) {
      const { def, row } = StoredFields.typed(value);
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
  static async delete(db: Db, where: { entityIds: string[]; entityType: string; types?: readonly string[] }) {
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
   * the order they were written: their fields' values, a set's in its order, and the entities their links name.
   */
  static async findMany(db: Db, where: PropertiesWhere): Promise<Property[]> {
    if (where.entityIds.length === 0) return [];
    const rows = [
      ...(where.entityType === "rulesets" ? [] : await StoredFields.findEntityRows(db, where)),
      ...(!where.entityType || where.entityType === "rulesets" ? await StoredFields.findRulesetRows(db, where) : []),
    ];

    // As properties were read: by when they were written, their owner, their type and their value (a set by its order)
    return rows
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.entityId.localeCompare(b.entityId) ||
          a.type.localeCompare(b.type) ||
          a.ordinal - b.ordinal,
      )
      .map(propertyOf);
  }
}
