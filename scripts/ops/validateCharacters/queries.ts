import { sql, type SQL } from "drizzle-orm";

import { db } from "@/server/database/index.ts";

/** The active characters' rows, which every check below reads */
export const ACTIVE_CHARACTERS = sql`(SELECT id FROM character.characters WHERE deleted_at IS NULL)`;

/** The active characters' advancements (their levels) */
export const ACTIVE_ADVANCEMENTS = sql`(SELECT id FROM character.advancements WHERE character_id IN ${ACTIVE_CHARACTERS})`;

/**
 * The rulesets a character's (`c`) ruleset reads entities from: its own, its extensions and the ruleset it's forked
 * from (`CowSources.buildSourceChain`), as an array.
 */
export const CHAIN = sql`(SELECT ARRAY[r.id] || ARRAY(
    SELECT x.extension_id FROM rules.ruleset_extensions x WHERE x.ruleset_id = r.id AND x.deleted_at IS NULL
    ORDER BY x.ordinal
  ) || array_remove(ARRAY[r.ruleset_id], NULL) FROM rules.rulesets r WHERE r.id = c.ruleset_id)`;

export async function query<T extends Record<string, unknown>>(statement: SQL) {
  return (await db.execute<T>(statement)).rows;
}
