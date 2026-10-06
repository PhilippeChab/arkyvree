import { sql, type SQL } from "drizzle-orm";

import type { charactersInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

export type Character = typeof charactersInCharacter.$inferSelect;

/** The active characters' rows, which every check below reads */
export const ACTIVE_CHARACTERS = sql`(SELECT id FROM character.characters WHERE deleted_at IS NULL)`;

export const ACTIVE_LEVELS = sql`(SELECT id FROM character.levels WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)`;

export async function query<T extends Record<string, unknown>>(statement: SQL) {
  return (await db.execute<T>(statement)).rows;
}
