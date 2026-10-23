import { and, eq, type SQL, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { linksInCharacter } from "@/drizzle/schema.ts";
import { Engine } from "@/engine/index.ts";

/**
 * A character's links of a role, as its module declares them (`Engine.storage().character().links[name]`: 3.5's
 * scores, its languages): read as rows naming their entity under its column (and their amount under its own, if they
 * hold one), and written from them (`values`).
 */
export default class StoredCharacterLinks {
  /** The links' row columns: the character, the entity and the amount by their names, and the timestamps. */
  static buildColumns(name: string): Record<string, PgColumn | SQL> {
    const link = Engine.storage().character().links[name];
    return {
      characterId: linksInCharacter.characterId,
      [link.entity]: linksInCharacter.entityId,
      ...(link.amount ? { [link.amount]: linksInCharacter.amount } : {}),
      createdAt: linksInCharacter.createdAt,
      updatedAt: linksInCharacter.updatedAt,
      deletedAt: sql<string | null>`NULL::timestamptz`,
    };
  }

  /** The condition that picks the links of `name`'s role, and `where`. */
  static buildScope(name: string, where?: SQL): SQL {
    return and(eq(linksInCharacter.role, Engine.storage().character().links[name].role), where)!;
  }

  /** A link's row to write, from a row by its columns: its role, its entity and its type, its amount. */
  static buildValues(name: string, row: Record<string, unknown>): typeof linksInCharacter.$inferInsert {
    const storage = Engine.storage();
    const link = storage.character().links[name];
    const role = storage.registries().characterRoles.find((def) => def.role === link.role)!;
    return {
      characterId: row.characterId as string,
      role: link.role,
      single: role.single,
      entityId: row[link.entity] as string,
      entityType: role.entityType,
      amount: link.amount ? (row[link.amount] as number) : null,
      createdAt: row.createdAt as string | undefined,
      updatedAt: row.updatedAt as string | undefined,
    };
  }
}
