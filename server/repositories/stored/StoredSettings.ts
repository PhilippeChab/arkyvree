import { inArray, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { rulesetFieldsInRules, rulesetLinksInRules } from "@/drizzle/schema.ts";
import { Engine, type FieldsWrite, type FieldValue, type StoredRuleset } from "@/engine/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { toFieldRows } from "./toFieldRows.ts";

/** A ruleset's write of its Settings: its id, its base rules (whose module's fields it takes), and what it replaces. */
export interface SettingsUpdate {
  baseRules: BaseRules;
  id: string;
  write: FieldsWrite;
}

/** A field's rows' value, typed by the column that holds it: a text, a number or a flag. */
const FIELD_VALUE = sql<FieldValue>`coalesce(to_json(${rulesetFieldsInRules.textValue}), to_json(${rulesetFieldsInRules.numberValue}), to_json(${rulesetFieldsInRules.flagValue}))`;

/** The pairs of rulesets' ids and the fields or roles a write names (`named`), as a query's rows: `(id, name)`. */
function unnest(named: { id: string; name: string }[]) {
  return sql`select * from unnest(${sql.param(named.map((one) => one.id))}::uuid[], ${sql.param(named.map((one) => one.name))}::text[])`;
}

/**
 * A ruleset's own Settings, as the generic tables store them: its fields (`rules.ruleset_fields`, a set's one a row)
 * and its single links (`ruleset_links`: 3.5's skill point ability), read as stored (`findMany`), each a field's value in
 * its column by its declaration, written as an entity's fields are (`toFieldRows`). A fork holds none until it saves
 * its own: its chain's are read in their place (`rulesetValuesOf`).
 */
class StoredSettings {
  /** Rulesets' own Settings as stored (`ids`): their fields' values and their links; one that holds none, left out. */
  async findMany(db: Db, where: { ids: string[] }): Promise<StoredRuleset[]> {
    if (where.ids.length === 0) return [];
    const fields = await db
      .select({
        rulesetId: rulesetFieldsInRules.rulesetId,
        field: rulesetFieldsInRules.field,
        ordinal: rulesetFieldsInRules.ordinal,
        value: FIELD_VALUE,
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
   * Writes rulesets' Settings (`writes`, each a ruleset's): each field and link role a write names replaced by its
   * values (in their order, a set's ordinals 0 to n-1) and the entity it names, none for `[]` or null; what it doesn't
   * name stays. A value is written as every write stores it, as its ruleset's own module declares it
   * (`Engine.storage().writtenFields`, by its base rules: `SettingsUpdate.baseRules`), in its field's column by its declaration, refused when it
   * isn't of its kind.
   */
  async update(db: Db, writes: SettingsUpdate[]) {
    const storage = Engine.storage();
    const roles = storage.registries().rulesetRoles;
    const fields = writes.flatMap(({ id, write }) => Object.keys(write.fields).map((name) => ({ id, name })));
    const links = writes.flatMap(({ id, write }) => Object.keys(write.links).map((name) => ({ id, name })));
    const fieldRows = writes.flatMap(({ baseRules, id, write }) => {
      const written = storage.writtenFields(storage.settingsOwnerType, write.fields, false, baseRules);
      return Object.entries(written).flatMap(([field, values]) =>
        toFieldRows(storage.settingsOwnerType, field, values).map((row) => ({ rulesetId: id, ...row })),
      );
    });
    const linkRows = writes.flatMap(({ id, write }) =>
      Object.entries(write.links).flatMap(([role, toId]) => {
        const def = roles.find((held) => held.role === role);
        if (!def) throw new Error(`No module declares the ruleset role ${role}`);
        return toId === null ? [] : [{ rulesetId: id, role, toId, toType: def.toType }];
      }),
    );
    if (fields.length > 0) {
      await db
        .delete(rulesetFieldsInRules)
        .where(sql`(${rulesetFieldsInRules.rulesetId}, ${rulesetFieldsInRules.field}) in (${unnest(fields)})`);
    }
    if (links.length > 0) {
      await db
        .delete(rulesetLinksInRules)
        .where(sql`(${rulesetLinksInRules.rulesetId}, ${rulesetLinksInRules.role}) in (${unnest(links)})`);
    }
    if (fieldRows.length > 0) await db.insert(rulesetFieldsInRules).values(fieldRows);
    if (linkRows.length > 0) await db.insert(rulesetLinksInRules).values(linkRows);
  }
}

export default StoredSettings;
