import { and, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter, entitiesInRules, fieldsInCharacter, linksInCharacter } from "@/drizzle/schema.ts";
import { Engine, type StoredCharacterRow, type StoredCharacterWrite } from "@/engine/index.ts";

import { toQualified } from "./toQualified.ts";

/**
 * A character's row as the generic tables store it: its own columns (`character.characters`), its fields' values
 * (`character.fields`: 3.5's alignment, XP) and its single links (`character.links`: its race), read in one query
 * (`buildColumns`) and mapped to its module's row by the engine (`mapRows`), and written as the engine splits a row.
 */
export default class StoredCharacters {
  /** The columns a character's read selects: its own, its fields' values (typed) and its single links' entities. */
  static buildColumns() {
    const id = toQualified(charactersInCharacter.id);
    return {
      ...getTableColumns(charactersInCharacter),
      fields: sql<StoredCharacterRow["fields"]>`(
        SELECT coalesce(json_agg(json_build_object('field', ${fieldsInCharacter.field}, 'value', coalesce(to_json(${fieldsInCharacter.textValue}), to_json(${fieldsInCharacter.numberValue})))), '[]')
        FROM ${fieldsInCharacter} WHERE ${fieldsInCharacter.characterId} = ${id} AND ${fieldsInCharacter.ordinal} = 0)`,
      links: sql<StoredCharacterRow["links"]>`(
        SELECT coalesce(json_agg(json_build_object('role', ${linksInCharacter.role}, 'toId', ${linksInCharacter.entityId})), '[]')
        FROM ${linksInCharacter} WHERE ${linksInCharacter.characterId} = ${id} AND ${linksInCharacter.single})`,
    };
  }

  /** The type of an entity a character's row names (its item's), read where it's written: its own. */
  static buildTypeOf(entityId: string): SQL<string> {
    return sql<string>`(SELECT ${entitiesInRules.type} FROM ${entitiesInRules} WHERE ${entitiesInRules.id} = ${entityId})`;
  }

  /** Stored characters (`buildColumns`'s) as their module's rows. */
  static mapRows<R>(rows: StoredCharacterRow[]): R[] {
    return rows.map((row) => Engine.storage().characterRowOf(row) as R);
  }

  /**
   * Writes the fields and single links of characters (`ids`) a write gives: each value set (null, none) replacing what
   * they held of it.
   */
  static async write(db: Db, ids: string[], { fields, links }: Omit<StoredCharacterWrite, "own">) {
    if (ids.length === 0) return;
    for (const link of links) {
      await db
        .delete(linksInCharacter)
        .where(and(inArray(linksInCharacter.characterId, ids), eq(linksInCharacter.role, link.role)));
      if (link.toId === null) continue;
      await db.insert(linksInCharacter).values(
        ids.map((characterId) => ({
          characterId,
          role: link.role,
          single: link.single,
          entityId: link.toId!,
          entityType: link.entityType,
        })),
      );
    }
    for (const field of fields) {
      await db
        .delete(fieldsInCharacter)
        .where(and(inArray(fieldsInCharacter.characterId, ids), eq(fieldsInCharacter.field, field.field)));
      if (field.value === null) continue;
      await db.insert(fieldsInCharacter).values(
        ids.map((characterId) => ({
          characterId,
          field: field.field,
          valueKind: field.kind,
          multiple: false,
          textValue: field.kind === "text" ? String(field.value) : null,
          numberValue: field.kind === "number" ? String(field.value) : null,
        })),
      );
    }
  }
}
