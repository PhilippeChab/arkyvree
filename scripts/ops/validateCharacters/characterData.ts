import { sql } from "drizzle-orm";

import type { Character } from "@/shared/relations.ts";

import { ACTIVE_ADVANCEMENTS, ACTIVE_CHARACTERS, query } from "./queries.ts";

/** Prints how many rows the active characters hold: their levels, their picks by step, their links by role, items. */
export async function printCharacterData(characters: Character[]) {
  const [counts] = await query<{ inventory: string; levels: string }>(sql`SELECT
       (SELECT count(*) FROM character.advancements WHERE id IN ${ACTIVE_ADVANCEMENTS})::text AS levels,
       (SELECT count(*) FROM character.inventory WHERE character_id IN ${ACTIVE_CHARACTERS})::text AS inventory`);
  const picks = await query<{ count: string; step: string }>(
    sql`SELECT step, count(*)::text AS count FROM character.advancement_picks
        WHERE advancement_id IN ${ACTIVE_ADVANCEMENTS} GROUP BY step ORDER BY step`,
  );
  const links = await query<{ count: string; role: string }>(
    sql`SELECT role, count(*)::text AS count FROM character.links
        WHERE character_id IN ${ACTIVE_CHARACTERS} GROUP BY role ORDER BY role`,
  );

  console.log("Character data:");
  console.log(`  characters: ${characters.length}, levels: ${counts.levels}, inventory: ${counts.inventory}`);
  console.log(`  picks: ${picks.map((row) => `${row.step} ${row.count}`).join(", ")}`);
  console.log(`  links: ${links.map((row) => `${row.role} ${row.count}`).join(", ")}\n`);
}
