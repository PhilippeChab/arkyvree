import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { entitiesInRules, entityFieldsInRules, entityLinksInRules } from "@/drizzle/schema.ts";
import { Engine, type StoredColumn } from "@/engine/index.ts";

import { qualified } from "./qualified.ts";

/** A kind's row, as a write gives it: its columns by their names. */
export type StoredValues = Record<string, unknown>;

/** The columns every entity's row holds, which `rules.entities` keeps as they are. */
const ENTITY_COLUMNS = {
  id: entitiesInRules.id,
  rulesetId: entitiesInRules.rulesetId,
  campaignId: entitiesInRules.campaignId,
  name: entitiesInRules.name,
  description: entitiesInRules.description,
  createdAt: entitiesInRules.createdAt,
  updatedAt: entitiesInRules.updatedAt,
  deletedAt: entitiesInRules.deletedAt,
};

/** The columns an owned entity's row holds (a class level's), whose scope and name are its owner's and its position. */
const OWNED_COLUMNS = {
  id: entitiesInRules.id,
  createdAt: entitiesInRules.createdAt,
  updatedAt: entitiesInRules.updatedAt,
  deletedAt: entitiesInRules.deletedAt,
};

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/** A field's typed value column, by its kind. */
const VALUE_COLUMNS = {
  flag: entityFieldsInRules.flagValue,
  number: entityFieldsInRules.numberValue,
  text: entityFieldsInRules.textValue,
} as const;

/** What a column a field holds reads: its single value, the row of ordinal 0, cast as the column was typed. */
function readField(column: Extract<StoredColumn, { field: string }>): SQL {
  const value = sql`(SELECT ${VALUE_COLUMNS[column.kind]} FROM ${entityFieldsInRules} WHERE ${entityFieldsInRules.entityId} = ${qualified(entitiesInRules.id)} AND ${entityFieldsInRules.field} = ${column.field} AND ${entityFieldsInRules.ordinal} = 0)`;
  if (column.kind !== "number") return value;
  if ("integer" in column) return sql`${value}::integer`;
  return sql`round(${value}, ${sql.raw(String(column.scale))})::text`;
}

/** What a stored column reads, over the entity's row (`rules.entities`). */
function readColumn(column: StoredColumn): PgColumn | SQL {
  switch (column.kind) {
    case "link":
      return sql`(SELECT ${entityLinksInRules.toId} FROM ${entityLinksInRules} WHERE ${entityLinksInRules.fromId} = ${qualified(entitiesInRules.id)} AND ${entityLinksInRules.role} = ${column.role})`;
    case "owner":
      return entitiesInRules.ownerId;
    case "partition":
      return entitiesInRules.partition;
    case "position":
      return entitiesInRules.position;
    default:
      return readField(column);
  }
}

/** A field's value as its typed column holds it. */
function fieldValue(kind: "flag" | "number" | "text", value: unknown) {
  return {
    valueKind: kind,
    textValue: kind === "text" ? String(value) : null,
    numberValue: kind === "number" ? String(value) : null,
    flagValue: kind === "flag" ? Boolean(value) : null,
  };
}

/**
 * A ruleset entity kind's rows, as the generic tables store them (`rules.entities`, its fields in `entity_fields`, its
 * single links in `entity_links`) and its module declares them (`Engine.storage().kind(type)`): read as one row each,
 * every column under its name (`columns`), and written from one (`insert`, `update`).
 */
export default class StoredEntities {
  /** The kind's declared columns, past an entity's own. */
  private static declared(type: string): [string, StoredColumn][] {
    return Object.entries(Engine.storage().kind(type).columns);
  }

  /** The owner's type of an owned kind's entities (a class level's class), or null. */
  private static ownerTypeOf(type: string) {
    return (
      Engine.storage()
        .registries()
        .entityTypes.find((def) => def.type === type)?.ownerType ?? null
    );
  }

  /**
   * The fields and single links a write's values (`values`, a kind's row by its columns) set on an entity: each one the
   * values name (or, on a create, every one, defaulted), with its value or null (none).
   */
  private static parts(type: string, values: StoredValues, creating: boolean) {
    const fields: { field: string; kind: "flag" | "number" | "text"; value: unknown }[] = [];
    const links: { role: string; toId: unknown }[] = [];
    for (const [name, column] of StoredEntities.declared(type)) {
      if (!creating && !(name in values)) continue;
      if (column.kind === "link") links.push({ role: column.role, toId: values[name] ?? null });
      else if (column.kind === "flag" || column.kind === "number" || column.kind === "text") {
        const value = values[name] ?? ("default" in column ? column.default : undefined) ?? null;
        fields.push({ field: column.field, kind: column.kind, value });
      }
    }
    return { fields, links };
  }

  /**
   * Writes the fields and single links writes set on entities (`writes`: each entity's ids and the values set on them),
   * replacing what they held of them, in batches.
   */
  private static async writeParts(
    db: Db,
    type: string,
    writes: { ids: string[]; values: StoredValues }[],
    creating: boolean,
  ) {
    const storage = Engine.storage();
    const fieldRows: (typeof entityFieldsInRules.$inferInsert)[] = [];
    const linkRows: (typeof entityLinksInRules.$inferInsert)[] = [];
    for (const { ids, values } of writes) {
      if (ids.length === 0) continue;
      const { fields, links } = StoredEntities.parts(type, values, creating);
      if (!creating && fields.length > 0)
        await db.delete(entityFieldsInRules).where(
          and(
            inArray(entityFieldsInRules.entityId, ids),
            inArray(
              entityFieldsInRules.field,
              fields.map((field) => field.field),
            ),
          ),
        );
      if (!creating && links.length > 0)
        await db.delete(entityLinksInRules).where(
          and(
            inArray(entityLinksInRules.fromId, ids),
            inArray(
              entityLinksInRules.role,
              links.map((link) => link.role),
            ),
          ),
        );
      for (const field of fields)
        if (field.value !== null)
          for (const entityId of ids)
            fieldRows.push({
              entityId,
              entityType: type,
              field: field.field,
              multiple: false,
              ...fieldValue(field.kind, field.value),
            });
      for (const link of links) {
        if (link.toId === null) continue;
        const role = storage.registries().linkRoles.find((def) => def.role === link.role && def.fromType === type)!;
        for (const fromId of ids)
          linkRows.push({
            fromId,
            fromType: type,
            role: link.role,
            single: role.single,
            toId: String(link.toId),
            toType: role.toType,
          });
      }
    }
    for (let i = 0; i < fieldRows.length; i += WRITE_BATCH)
      await db.insert(entityFieldsInRules).values(fieldRows.slice(i, i + WRITE_BATCH));
    for (let i = 0; i < linkRows.length; i += WRITE_BATCH)
      await db.insert(entityLinksInRules).values(linkRows.slice(i, i + WRITE_BATCH));
  }

  /**
   * The columns a kind's row reads (`type`), each a column of `rules.entities` or what its fields and links hold, by
   * its name: what a query of its rows selects, filters and orders by.
   */
  static columns(type: string): Record<string, PgColumn | SQL> {
    const own = StoredEntities.ownerTypeOf(type) ? OWNED_COLUMNS : ENTITY_COLUMNS;
    return {
      ...own,
      ...Object.fromEntries(StoredEntities.declared(type).map(([name, column]) => [name, readColumn(column)])),
    };
  }

  /**
   * Writes a kind's new rows (`rows`, each by its columns), each an entity, its fields (a column a write leaves out is
   * its default, if it has one) and its single links. An owned entity takes its owner's ruleset and campaign. Answers
   * their ids, in order.
   */
  static async insert(db: Db, type: string, rows: StoredValues[]): Promise<string[]> {
    if (rows.length === 0) return [];
    const declared = StoredEntities.declared(type);
    const partition = declared.find(([, column]) => column.kind === "partition");
    const owner = declared.find(([, column]) => column.kind === "owner")?.[0];
    const position = declared.find(([, column]) => column.kind === "position")?.[0];
    const ownerType = StoredEntities.ownerTypeOf(type);

    const owners = new Map<string, { campaignId: string | null; rulesetId: string }>();
    if (owner) {
      const ownerIds = [...new Set(rows.map((row) => String(row[owner])))];
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

    const entityRows = rows.map((row) => {
      const ownerRow = owner ? owners.get(String(row[owner])) : undefined;
      if (owner && !ownerRow) throw new Error(`A ${type} names an owner that doesn't exist: ${String(row[owner])}`);
      const [partitionName, partitionColumn] = partition ?? [];
      return {
        id: row.id as string | undefined,
        type,
        rulesetId: ownerRow?.rulesetId ?? (row.rulesetId as string),
        campaignId: ownerRow ? ownerRow.campaignId : ((row.campaignId as string | null | undefined) ?? null),
        name: owner ? null : (row.name as string),
        description: owner ? null : ((row.description as string | null | undefined) ?? null),
        ownerId: owner ? String(row[owner]) : null,
        ownerType,
        position: position ? (row[position] as number) : null,
        partition:
          partitionName && partitionColumn?.kind === "partition"
            ? ((row[partitionName] as string | undefined) ?? partitionColumn.default)
            : "",
        createdAt: row.createdAt as string | undefined,
        updatedAt: row.updatedAt as string | undefined,
        deletedAt: (row.deletedAt as string | null | undefined) ?? null,
      };
    });
    const inserted: { id: string }[] = [];
    for (let i = 0; i < entityRows.length; i += WRITE_BATCH)
      inserted.push(
        ...(await db
          .insert(entitiesInRules)
          .values(entityRows.slice(i, i + WRITE_BATCH))
          .returning({ id: entitiesInRules.id })),
      );

    await StoredEntities.writeParts(
      db,
      type,
      rows.map((values, index) => ({ ids: [inserted[index].id], values })),
      true,
    );
    return inserted.map((row) => row.id);
  }

  /** The condition that picks a kind's entities among every kind's: their type. */
  static scope(type: string): SQL {
    return eq(entitiesInRules.type, type);
  }

  /**
   * Writes a change to a kind's rows (`values`, the columns it sets) where `where` picks them (`where` reads the kind's
   * columns): their entity's own columns, their fields and their single links, the entity's `updatedAt` moved as any
   * change moves it. Answers the ids it changed.
   */
  static async update(db: Db, type: string, values: StoredValues, where: SQL): Promise<string[]> {
    const own = Object.fromEntries(
      Object.entries(values).filter(([name]) => ["name", "description", "deletedAt", "campaignId"].includes(name)),
    );
    const partition = StoredEntities.declared(type).find(([, column]) => column.kind === "partition")?.[0];
    const position = StoredEntities.declared(type).find(([, column]) => column.kind === "position")?.[0];
    const updated = await db
      .update(entitiesInRules)
      .set({
        ...own,
        ...(partition && partition in values ? { partition: values[partition] as string } : {}),
        ...(position && position in values ? { position: values[position] as number } : {}),
        updatedAt: (values.updatedAt as string | undefined) ?? new Date().toISOString(),
      })
      .where(and(StoredEntities.scope(type), where))
      .returning({ id: entitiesInRules.id });
    const ids = updated.map((row) => row.id);
    await StoredEntities.writeParts(db, type, [{ ids, values }], false);
    return ids;
  }
}
