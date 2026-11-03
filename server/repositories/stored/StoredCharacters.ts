import { and, eq, getTableColumns, inArray, type SQL, sql } from "drizzle-orm";

import type { Db } from "@/drizzle/database.ts";
import {
  charactersInCharacter,
  entitiesInRules,
  fieldsInCharacter,
  linksInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { Engine, type FieldValue, type FieldWrite, type StorageEngine } from "@/engine/index.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Character } from "@/shared/relations.ts";

import { toFieldRows } from "./toFieldRows.ts";
import { toQualified } from "./toQualified.ts";

/** What a write of a character's row stores past its own columns: its fields' values and its single links' entities. */
export interface CharacterValuesWrite {
  /** Each field's values it sets, by field (3.5's `CHARACTER_XP`), null or none to clear it */
  fields?: Record<string, FieldWrite>;
  /** The entity of each single link it sets, by role (3.5's `race`), null to clear it */
  links?: Record<string, string | null>;
}

/** A field's value as JSON, typed by the column that holds it: a text, a number or a flag. */
const FIELD_JSON = sql`coalesce(to_json(${fieldsInCharacter.textValue}), to_json(${fieldsInCharacter.numberValue}), to_json(${fieldsInCharacter.flagValue}))`;

/**
 * A character's row as the generic tables store it: its own columns (`character.characters`), its fields' values by
 * field (`character.fields`: 3.5's alignment, XP; a set's one a row) and its single links' entities by role
 * (`character.links`: its race), read in one query (`buildColumns`, then `toCharacter`: its fields as its module
 * declares them, as an entity's are), and written as given (`write`): its fields as every owner's are, as its own
 * module declares them (`Engine.storage().writtenFields`, `toFieldRows`), each role's entity type as the modules
 * declare it.
 */
export default class StoredCharacters {
  /**
   * Writes the fields of characters (`ids`) a write gives (`fields`), as their module declares them (`storage`, by
   * their ruleset's base rules): each value set replacing what they held of it, a new character's (`creating`) with its
   * module's fields always written.
   */
  private static async writeFields(
    db: Db,
    ids: string[],
    fields: Record<string, FieldWrite>,
    creating: boolean,
    storage: StorageEngine,
  ) {
    const owner = storage.characterOwnerType;
    // A ruleset's base rules are a registered module's, by their foreign key to `rules.modules`
    const modules = await db
      .select({ id: charactersInCharacter.id, baseRules: sql<BaseRules>`${rulesetsInRules.baseRules}` })
      .from(charactersInCharacter)
      .innerJoin(rulesetsInRules, eq(rulesetsInRules.id, charactersInCharacter.rulesetId))
      .where(inArray(charactersInCharacter.id, ids));
    for (const [baseRules, characters] of Map.groupBy(modules, (row) => row.baseRules)) {
      const stored = Object.entries(storage.writtenFields(owner, fields, creating, baseRules));
      if (stored.length === 0) continue;
      const rows = stored.flatMap(([field, values]) => toFieldRows(owner, field, values, storage));
      const characterIds = characters.map((character) => character.id);
      await db.delete(fieldsInCharacter).where(
        and(
          inArray(fieldsInCharacter.characterId, characterIds),
          inArray(
            fieldsInCharacter.field,
            stored.map(([field]) => field),
          ),
        ),
      );
      const written = characterIds.flatMap((characterId) => rows.map((row) => ({ characterId, ...row })));
      if (written.length > 0) await db.insert(fieldsInCharacter).values(written);
    }
  }

  /**
   * The columns a character's read selects: its own, its fields' values (each a field and its value, typed by its
   * column, a set's in their stored order), which `toCharacter` reads, and its single links' entities.
   */
  static buildColumns() {
    const id = toQualified(charactersInCharacter.id);
    return {
      ...getTableColumns(charactersInCharacter),
      fields: sql<[string, FieldValue][]>`(
        SELECT coalesce(json_agg(json_build_array(${fieldsInCharacter.field}, ${FIELD_JSON}) ORDER BY ${fieldsInCharacter.field}, ${fieldsInCharacter.ordinal}), '[]')
        FROM ${fieldsInCharacter} WHERE ${fieldsInCharacter.characterId} = ${id})`,
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
   * A character's row as read (`row`, its columns `buildColumns` selects): its fields' values by field, as its module
   * declares them (`storage`, every registered module's unless a test gives its own: `fieldsOf`, a single field's
   * value, a set's values in their declared order).
   */
  static toCharacter<R extends { fields: [string, FieldValue][] }>(
    row: R,
    storage: StorageEngine = Engine.storage(),
  ): Omit<R, "fields"> & Pick<Character, "fields"> {
    return { ...row, fields: storage.fieldsOf(storage.characterOwnerType, row.fields) };
  }

  /**
   * Writes the fields and single links of characters (`ids`) a write gives: each value set (null, none) replacing what
   * they held of it, a field's as every owner's is stored (`Engine.storage().writtenFields`: an empty text, none; one
   * always written, its default when it holds none: a new character's it leaves out too, `creating`), in its field's
   * column by its declaration (`toFieldRows`), as its own module declares them (`writeFields`; `storage`, every
   * registered module's unless a test gives its own).
   */
  static async write(
    db: Db,
    ids: string[],
    { fields = {}, links = {} }: CharacterValuesWrite,
    creating = false,
    storage: StorageEngine = Engine.storage(),
  ) {
    if (ids.length === 0) return;
    const roles = Object.keys(links);
    if (roles.length > 0) {
      await db
        .delete(linksInCharacter)
        .where(and(inArray(linksInCharacter.characterId, ids), inArray(linksInCharacter.role, roles)));
      const written = Object.entries(links).flatMap(([role, entityId]) => {
        if (entityId === null) return [];
        const def = storage.characterRole(role);
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
    if (creating || Object.keys(fields).length > 0)
      await StoredCharacters.writeFields(db, ids, fields, creating, storage);
  }
}
