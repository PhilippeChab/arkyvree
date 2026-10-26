import { and, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter, entitiesInRules, fieldsInCharacter, linksInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";
import type { Character, CharacterFieldValue } from "@/shared/relations.ts";

import { toQualified } from "./toQualified.ts";

/** What a write of a character's row stores past its own columns: its fields' values and its single links' entities. */
export interface CharacterValuesWrite {
  /** Each field's value it sets, by field (3.5's `CHARACTER_XP`), null to clear it */
  fields?: Record<string, CharacterFieldValue | null>;
  /** The entity of each single link it sets, by role (3.5's `race`), null to clear it */
  links?: Record<string, string | null>;
}

/**
 * A character's row as the generic tables store it: its own columns (`character.characters`), its fields' values by
 * field (`character.fields`: 3.5's alignment, XP), each as typed as its column holds it, and its single links' entities
 * by role (`character.links`: its race), read in one query (`buildColumns`), and written as given (`write`), each
 * field's kind and each role's entity type as the modules declare them.
 */
export default class StoredCharacters {
  /**
   * A field's value as its column holds it, refused when it isn't of its declared kind, or a number its field doesn't
   * hold exactly (`StorageEngine.storedNumber`).
   */
  private static columnsOf(field: string, value: CharacterFieldValue) {
    const storage = Engine.storage();
    const def = storage.field("characters", field);
    if (!def) throw new Error(`No module declares the character field ${field}`);
    if (def.valueKind === "text" && typeof value !== "string")
      throw new Error(`The character field ${field} holds a text, not ${String(value)}`);
    return {
      valueKind: def.valueKind,
      multiple: false,
      textValue: def.valueKind === "text" ? String(value) : null,
      numberValue: def.valueKind === "number" ? storage.storedNumber("characters", field, value) : null,
    };
  }

  /** The columns a character's read selects: its own, its fields' values (typed) and its single links' entities. */
  static buildColumns() {
    const id = toQualified(charactersInCharacter.id);
    return {
      ...getTableColumns(charactersInCharacter),
      fields: sql<Character["fields"]>`(
        SELECT coalesce(json_object_agg(${fieldsInCharacter.field}, coalesce(to_json(${fieldsInCharacter.textValue}), to_json(${fieldsInCharacter.numberValue})) ORDER BY ${fieldsInCharacter.field}), '{}')
        FROM ${fieldsInCharacter} WHERE ${fieldsInCharacter.characterId} = ${id} AND ${fieldsInCharacter.ordinal} = 0)`,
      links: sql<Character["links"]>`(
        SELECT coalesce(json_object_agg(${linksInCharacter.role}, ${linksInCharacter.entityId} ORDER BY ${linksInCharacter.role}), '{}')
        FROM ${linksInCharacter} WHERE ${linksInCharacter.characterId} = ${id} AND ${linksInCharacter.single})`,
    };
  }

  /** The type of an entity a character's row names (its item's), read where it's written: its own. */
  static buildTypeOf(entityId: string): SQL<string> {
    return sql<string>`(SELECT ${entitiesInRules.type} FROM ${entitiesInRules} WHERE ${entitiesInRules.id} = ${entityId})`;
  }

  /**
   * Writes the fields and single links of characters (`ids`) a write gives: each value set (null, none) replacing what
   * they held of it.
   */
  static async write(db: Db, ids: string[], { fields = {}, links = {} }: CharacterValuesWrite) {
    if (ids.length === 0) return;
    const roles = Object.keys(links);
    if (roles.length > 0) {
      await db
        .delete(linksInCharacter)
        .where(and(inArray(linksInCharacter.characterId, ids), inArray(linksInCharacter.role, roles)));
      const written = Object.entries(links).flatMap(([role, entityId]) => {
        if (entityId === null) return [];
        const def = Engine.storage().characterRole(role);
        if (!def.single) throw new Error(`The character role ${role} isn't a single link`);
        return ids.map((characterId) => ({
          characterId,
          role,
          single: def.single,
          entityId,
          entityType: def.entityType,
        }));
      });
      if (written.length > 0) await db.insert(linksInCharacter).values(written);
    }
    const names = Object.keys(fields);
    if (names.length === 0) return;
    await db
      .delete(fieldsInCharacter)
      .where(and(inArray(fieldsInCharacter.characterId, ids), inArray(fieldsInCharacter.field, names)));
    const written = Object.entries(fields).flatMap(([field, value]) =>
      value === null
        ? []
        : ids.map((characterId) => ({ characterId, field, ...StoredCharacters.columnsOf(field, value) })),
    );
    if (written.length > 0) await db.insert(fieldsInCharacter).values(written);
  }
}
