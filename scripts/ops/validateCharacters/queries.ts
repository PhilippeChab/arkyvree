import { sql, type SQL } from "drizzle-orm";

import { db } from "@/server/database/index.ts";

/** The active characters' rows, which every check below reads */
export const ACTIVE_CHARACTERS = sql`(SELECT id FROM character.characters WHERE deleted_at IS NULL)`;

/** The active characters' live advancements (their levels) */
export const ACTIVE_ADVANCEMENTS = sql`(SELECT id FROM character.advancements WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)`;

export async function query<T extends Record<string, unknown>>(statement: SQL) {
  return (await db.execute<T>(statement)).rows;
}
