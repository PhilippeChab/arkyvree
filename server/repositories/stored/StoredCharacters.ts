import { and, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter, entitiesInRules, fieldsInCharacter, linksInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";

import { qualified } from "./qualified.ts";

/** A field's typed value column on a character, by its kind. */
const VALUE_COLUMNS = { number: fieldsInCharacter.numberValue, text: fieldsInCharacter.textValue } as const;

/**
 * A character's row as its module declares it (`Engine.storage().character()`): its own columns (`character.characters`)
 * and those its module stores as its fields (`character.fields`: 3.5's alignment, XP) or a single link (its race), read
 * as columns (`columns`) and written from them (`write`).
 */
export default class StoredCharacters {
  /** The columns a character's row reads, each a column of its own or what its field or its link holds. */
  static columns(): Record<string, PgColumn | SQL> {
    const declared = Engine.storage().character().columns;
    return {
      ...getTableColumns(charactersInCharacter),
      ...Object.fromEntries(
        Object.entries(declared).map(([name, column]) => [
          name,
          column.kind === "link"
            ? sql`(SELECT ${linksInCharacter.entityId} FROM ${linksInCharacter} WHERE ${linksInCharacter.characterId} = ${qualified(charactersInCharacter.id)} AND ${linksInCharacter.role} = ${column.role})`
            : column.kind === "number"
              ? sql`(SELECT ${VALUE_COLUMNS.number} FROM ${fieldsInCharacter} WHERE ${fieldsInCharacter.characterId} = ${qualified(charactersInCharacter.id)} AND ${fieldsInCharacter.field} = ${column.field} AND ${fieldsInCharacter.ordinal} = 0)::integer`
              : sql`(SELECT ${VALUE_COLUMNS.text} FROM ${fieldsInCharacter} WHERE ${fieldsInCharacter.characterId} = ${qualified(charactersInCharacter.id)} AND ${fieldsInCharacter.field} = ${column.field} AND ${fieldsInCharacter.ordinal} = 0)`,
        ]),
      ),
    };
  }

  /** A write's values (`values`) split into the character row's own columns and those its module stores elsewhere. */
  static split(values: Record<string, unknown>) {
    const declared = Engine.storage().character().columns;
    const own = Object.fromEntries(Object.entries(values).filter(([name]) => !(name in declared)));
    return { own, stored: Object.fromEntries(Object.entries(values).filter(([name]) => name in declared)) };
  }

  /**
   * Writes the columns a module stores of characters (`ids`), as their fields and links: each value set (null, none)
   * replacing what they held of it.
   */
  static async write(db: Db, ids: string[], values: Record<string, unknown>) {
    if (ids.length === 0) return;
    const storage = Engine.storage();
    const declared = storage.character().columns;
    for (const [name, value] of Object.entries(values)) {
      const column = declared[name];
      if (!column) continue;
      if (column.kind === "link") {
        await db
          .delete(linksInCharacter)
          .where(and(inArray(linksInCharacter.characterId, ids), eq(linksInCharacter.role, column.role)));
        if (value === null || value === undefined) continue;
        const role = storage.registries().characterRoles.find((def) => def.role === column.role)!;
        await db.insert(linksInCharacter).values(
          ids.map((characterId) => ({
            characterId,
            role: column.role,
            single: role.single,
            entityId: String(value),
            entityType: role.entityType,
          })),
        );
        continue;
      }
      await db
        .delete(fieldsInCharacter)
        .where(and(inArray(fieldsInCharacter.characterId, ids), eq(fieldsInCharacter.field, column.field)));
      if (value === null || value === undefined) continue;
      await db.insert(fieldsInCharacter).values(
        ids.map((characterId) => ({
          characterId,
          field: column.field,
          valueKind: column.kind,
          multiple: false,
          textValue: column.kind === "text" ? String(value) : null,
          numberValue: column.kind === "number" ? String(value) : null,
        })),
      );
    }
  }

  /** The type of an entity a character's row names (its item's), read where it's written: its own. */
  static typeOf(entityId: string): SQL<string> {
    return sql<string>`(SELECT ${entitiesInRules.type} FROM ${entitiesInRules} WHERE ${entitiesInRules.id} = ${entityId})`;
  }
}
