import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  entityFieldsInRules,
  entityLinksInRules,
  rulesetFieldsInRules,
  rulesetLinksInRules,
} from "@/drizzle/schema.ts";
import { Engine, type FieldsWrite, type FieldValue, type StoredRuleset, type StoredValues } from "@/engine/index.ts";

/** A field's or a link's row a write replaces: its owner, and the field or the role it names. */
interface Named {
  id: string;
  name: string;
}

/** Owners' fields' values and links, each with its owner's id. */
interface Owned {
  fields: { field: string; ownerId: string; value: FieldValue }[];
  links: { ownerId: string; role: string; toId: string }[];
}

/** What a write deletes and inserts in an owner's tables: an entity's, or a ruleset's. */
interface TableWrites<F, L> {
  fieldRows: F[];
  fields: Named[];
  linkRows: L[];
  links: Named[];
}

/** An owner's write of its stored values: its id, its type (an entity type, `rulesets`) and what it replaces. */
export interface FieldsUpdate {
  id: string;
  type: string;
  values: FieldsWrite;
}

/** The owner type whose stored values are a ruleset's own (its Settings), which a ruleset's tables hold. */
const RULESETS = "rulesets";

/** The most rows one insert writes: a statement holds at most 65,535 parameters. */
const WRITE_BATCH = 2000;

/** A field's rows' value, typed by the column that holds it: a text, a number or a flag. */
function valueOf(table: typeof entityFieldsInRules | typeof rulesetFieldsInRules) {
  return sql<FieldValue>`coalesce(to_json(${table.textValue}), to_json(${table.numberValue}), to_json(${table.flagValue}))`;
}

/**
 * Owners' stored values but their kind's own fields, as the generic tables store them: an entity's fields
 * (`rules.entity_fields`, a set's one a row) and the links its fields read (`entity_links`: a class's bonus spell
 * ability), a ruleset's Settings (`ruleset_fields`, `ruleset_links`: its skill point ability). Read as the view holds
 * them (`Engine.storage().storedValuesOf`), and written by what a save replaces (`FieldsWrite`), each value in its
 * field's column by its declaration.
 */
class StoredFields {
  /**
   * A field's row's columns of a value (`value`, the `ordinal`th of its field's, of an owner's type): its declared
   * kind's column, refused for a field no module declares or a value of another kind.
   */
  private static columnsOf(type: string, field: string, value: FieldValue, ordinal: number) {
    const def = Engine.storage().field(type, field);
    if (!def) throw new Error(`No module declares the field ${field} of ${type}`);
    const fits =
      def.valueKind === "number"
        ? typeof value === "number" && Number.isFinite(value)
        : typeof value === (def.valueKind === "flag" ? "boolean" : "string");
    if (!fits) throw new Error(`${field} holds a ${def.valueKind}: ${String(value)} isn't one`);
    return {
      field,
      ordinal: def.multiple ? ordinal : 0,
      valueKind: def.valueKind,
      multiple: def.multiple,
      textValue: def.valueKind === "text" ? (value as string) : null,
      numberValue: def.valueKind === "number" ? String(value) : null,
      flagValue: def.valueKind === "flag" ? (value as boolean) : null,
    };
  }

  /** Rulesets' stored Settings as their fields' values and links, each with its ruleset's id. */
  private static ownedOf(rulesets: StoredRuleset[]): Owned {
    return {
      fields: rulesets.flatMap((ruleset) => ruleset.fields.map((field) => ({ ...field, ownerId: ruleset.id }))),
      links: rulesets.flatMap((ruleset) => ruleset.links.map((link) => ({ ...link, ownerId: ruleset.id }))),
    };
  }

  /**
   * What owners' writes (`writes`) delete and insert in their tables: each field and role they name, and each value's
   * row (ordinals 0 to n-1, as given) and each link's.
   */
  private static tableWrites<F, L>(
    writes: FieldsUpdate[],
    fieldRow: (write: FieldsUpdate, field: string, value: FieldValue, ordinal: number) => F,
    linkRow: (write: FieldsUpdate, role: string, toId: string) => L,
  ): TableWrites<F, L> {
    const table: TableWrites<F, L> = { fieldRows: [], fields: [], linkRows: [], links: [] };
    for (const write of writes) {
      for (const [field, values] of Object.entries(write.values.fields)) {
        table.fields.push({ id: write.id, name: field });
        for (const [ordinal, value] of values.entries()) table.fieldRows.push(fieldRow(write, field, value, ordinal));
      }
      for (const [role, toId] of Object.entries(write.values.links)) {
        table.links.push({ id: write.id, name: role });
        if (toId !== null) table.linkRows.push(linkRow(write, role, toId));
      }
    }
    return table;
  }

  /** The pairs of owners' ids and names (`named`) a delete matches, as a query's rows: `(id, name)`. */
  private static unnested(named: Named[]) {
    return sql`select * from unnest(${sql.param(named.map((one) => one.id))}::uuid[], ${sql.param(named.map((one) => one.name))}::text[])`;
  }

  /**
   * Entities' (`ids`, of `type`) fields' values but their kind's own, and their links of the roles their kind's
   * fields read, each with its entity's id.
   */
  private static async readEntities(db: Db, ids: string[], type: string): Promise<Owned> {
    const storage = Engine.storage();
    const fields = await db
      .select({
        ownerId: entityFieldsInRules.entityId,
        field: entityFieldsInRules.field,
        value: valueOf(entityFieldsInRules),
      })
      .from(entityFieldsInRules)
      .where(
        and(
          inArray(entityFieldsInRules.entityId, ids),
          eq(entityFieldsInRules.entityType, type),
          notInArray(entityFieldsInRules.field, storage.recordReads().fields),
        ),
      );
    const roles = storage.declaredFields().fieldRoles(type);
    if (roles.length === 0) return { fields, links: [] };
    const links = await db
      .select({ ownerId: entityLinksInRules.fromId, role: entityLinksInRules.role, toId: entityLinksInRules.toId })
      .from(entityLinksInRules)
      .where(and(inArray(entityLinksInRules.fromId, ids), inArray(entityLinksInRules.role, roles)));
    return { fields, links };
  }

  /** Entities' writes: each field and role they name deleted, then their values and links inserted. */
  private static async updateEntities(db: Db, writes: FieldsUpdate[]) {
    const storage = Engine.storage();
    const { fieldRows, fields, linkRows, links } = StoredFields.tableWrites(
      writes,
      (write, field, value, ordinal) => ({
        entityId: write.id,
        entityType: write.type,
        ...StoredFields.columnsOf(write.type, field, value, ordinal),
      }),
      (write, role, toId) => {
        const def = storage.registries().linkRoles.find((link) => link.role === role && link.fromType === write.type);
        if (!def) throw new Error(`No module declares the role ${role} from ${write.type}`);
        return { fromId: write.id, fromType: write.type, role, single: def.single, toId, toType: def.toType };
      },
    );
    if (fields.length > 0) {
      await db
        .delete(entityFieldsInRules)
        .where(
          sql`(${entityFieldsInRules.entityId}, ${entityFieldsInRules.field}) in (${StoredFields.unnested(fields)})`,
        );
    }
    if (links.length > 0) {
      await db
        .delete(entityLinksInRules)
        .where(sql`(${entityLinksInRules.fromId}, ${entityLinksInRules.role}) in (${StoredFields.unnested(links)})`);
    }
    for (let i = 0; i < fieldRows.length; i += WRITE_BATCH)
      await db.insert(entityFieldsInRules).values(fieldRows.slice(i, i + WRITE_BATCH));
    for (let i = 0; i < linkRows.length; i += WRITE_BATCH)
      await db.insert(entityLinksInRules).values(linkRows.slice(i, i + WRITE_BATCH));
  }

  /** Rulesets' writes of their Settings: each field and role they name deleted, then their values and links inserted. */
  private static async updateRulesets(db: Db, writes: FieldsUpdate[]) {
    const storage = Engine.storage();
    const { fieldRows, fields, linkRows, links } = StoredFields.tableWrites(
      writes,
      (write, field, value, ordinal) => ({
        rulesetId: write.id,
        ...StoredFields.columnsOf(RULESETS, field, value, ordinal),
      }),
      (write, role, toId) => {
        const def = storage.registries().rulesetRoles.find((ruleset) => ruleset.role === role);
        if (!def) throw new Error(`No module declares the ruleset role ${role}`);
        return { rulesetId: write.id, role, toId, toType: def.toType };
      },
    );
    if (fields.length > 0) {
      await db
        .delete(rulesetFieldsInRules)
        .where(
          sql`(${rulesetFieldsInRules.rulesetId}, ${rulesetFieldsInRules.field}) in (${StoredFields.unnested(fields)})`,
        );
    }
    if (links.length > 0) {
      await db
        .delete(rulesetLinksInRules)
        .where(
          sql`(${rulesetLinksInRules.rulesetId}, ${rulesetLinksInRules.role}) in (${StoredFields.unnested(links)})`,
        );
    }
    if (fieldRows.length > 0) await db.insert(rulesetFieldsInRules).values(fieldRows);
    if (linkRows.length > 0) await db.insert(rulesetLinksInRules).values(linkRows);
  }

  /**
   * Copies a ruleset's Settings as they're stored (`fromId`'s) onto another (`toId`, a fork that holds none): its
   * fields' values and its links, the entities they name as they are (the fork's view resolves them). One insert of
   * each table's rows, selected in the order of its insertable columns (its generated `value_key` aside), made now.
   */
  async createRulesetCopy(db: Db, where: { fromId: string; toId: string }) {
    const fields = rulesetFieldsInRules;
    await db
      .insert(fields)
      .select(
        sql`select ${where.toId}::uuid, ${fields.ownerType}, ${fields.field}, ${fields.ordinal}, ${fields.valueKind}, ${fields.multiple}, ${fields.textValue}, ${fields.numberValue}, ${fields.flagValue}, now(), now() from ${fields} where ${eq(fields.rulesetId, where.fromId)}`,
      );
    const links = rulesetLinksInRules;
    await db
      .insert(links)
      .select(
        sql`select ${where.toId}::uuid, ${links.role}, ${links.toId}, ${links.toType}, now(), now() from ${links} where ${eq(links.rulesetId, where.fromId)}`,
      );
  }

  /**
   * Owners' stored values (`ownerIds`, of `ownerType`: an entity type's, or `rulesets`), by owner, as the view holds
   * them: their fields but their kind's own, and the links their fields read; an owner that holds none, none.
   */
  async findMany(db: Db, where: { ownerIds: string[]; ownerType: string }): Promise<Map<string, StoredValues>> {
    if (where.ownerIds.length === 0) return new Map();
    const { ownerIds, ownerType } = where;
    const { fields, links } =
      ownerType === RULESETS
        ? StoredFields.ownedOf(await this.findRulesets(db, { ids: ownerIds }))
        : await StoredFields.readEntities(db, ownerIds, ownerType);
    const fieldsOf = Map.groupBy(fields, (field) => field.ownerId);
    const linksOf = Map.groupBy(links, (link) => link.ownerId);
    const storage = Engine.storage();
    return new Map(
      ownerIds.map((id) => [id, storage.storedValuesOf(ownerType, fieldsOf.get(id) ?? [], linksOf.get(id) ?? [])]),
    );
  }

  /** Rulesets' own Settings as stored (`ids`): their fields' values and their links. */
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

  /**
   * Writes owners' stored values (`writes`, each an owner's): each field and link role a write names replaced by its
   * values (in their order, a set's ordinals 0 to n-1) and the entity it names, none for `[]` or null; what it doesn't
   * name stays. A value is written in its field's column by its declaration, refused when it isn't of its kind.
   */
  async update(db: Db, writes: FieldsUpdate[]) {
    const rulesets = writes.filter((write) => write.type === RULESETS);
    const entities = writes.filter((write) => write.type !== RULESETS);
    if (entities.length > 0) await StoredFields.updateEntities(db, entities);
    if (rulesets.length > 0) await StoredFields.updateRulesets(db, rulesets);
  }
}

export default StoredFields;
