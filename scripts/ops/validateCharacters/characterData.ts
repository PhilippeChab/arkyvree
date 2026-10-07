import { sql } from "drizzle-orm";

import { ACTIVE_CHARACTERS, ACTIVE_LEVELS, type Character, query } from "./queries.ts";

/** Prints how many rows the active characters hold, by kind. */
export async function printCharacterData(characters: Character[]) {
  const [counts] = await query<{
    levels: string;
    feats: string;
    skills: string;
    powers: string;
    abilities: string;
    languages: string;
    inventory: string;
  }>(sql`SELECT
       (SELECT count(*) FROM character.levels WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)::text AS levels,
       (SELECT count(*) FROM character.level_feats WHERE character_level_id IN ${ACTIVE_LEVELS} AND deleted_at IS NULL)::text AS feats,
       (SELECT count(*) FROM character.level_skills WHERE character_level_id IN ${ACTIVE_LEVELS} AND deleted_at IS NULL)::text AS skills,
       (SELECT count(*) FROM character.level_powers WHERE character_level_id IN ${ACTIVE_LEVELS} AND deleted_at IS NULL)::text AS powers,
       (SELECT count(*) FROM character.character_abilities WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)::text AS abilities,
       (SELECT count(*) FROM character.languages WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)::text AS languages,
       (SELECT count(*) FROM character.inventory WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)::text AS inventory`);

  console.log("Character data:");
  console.log(`  characters: ${characters.length}, levels: ${counts.levels}, feats: ${counts.feats}`);
  console.log(`  skills: ${counts.skills}, powers: ${counts.powers}, inventory: ${counts.inventory}`);
  console.log(`  abilities: ${counts.abilities}, languages: ${counts.languages}\n`);
}
