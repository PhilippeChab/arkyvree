import { sql } from "drizzle-orm";

import { CHAIN, query } from "./queries.ts";

/**
 * Phase 2: every entity a level picked through a pool (a feat through its aptitude, a spell through its list) is one
 * the pool lists, as the character's ruleset reads them: a link of the role from the step's entity type to its pool's
 * (`rules.link_roles`: 3.5's `listedIn`), from the entity or a copy of it in the character's ruleset chain to the pool
 * or a copy of it there (a copy of a copy too). Returns the issues found.
 */
export async function checkPools() {
  console.log("\n═══ Phase 2: Pool Listings ═══\n");
  const unlisted = await query<{
    charName: string;
    entityName: string;
    entityRuleset: string;
    poolName: string;
    step: string;
  }>(
    sql`WITH RECURSIVE picked AS (
       SELECT c.id AS character_id, c.name AS char_name, ${CHAIN} AS chain, p.step, p.entity_id, p.entity_type,
              p.via_id, p.via_type
         FROM character.advancement_picks p
         JOIN character.advancements a ON a.id = p.advancement_id
         JOIN character.characters c ON c.id = a.character_id
        WHERE c.deleted_at IS NULL AND p.via_id IS NOT NULL
     ), standing (character_id, chain, named_id, id) AS (
       SELECT DISTINCT character_id, chain, named.id, named.id
         FROM picked, LATERAL (VALUES (entity_id), (via_id)) AS named (id)
       UNION
       SELECT st.character_id, st.chain, st.named_id, s.forked_entity_id
         FROM standing st
         JOIN rules.entity_snapshots s ON s.source_entity_id = st.id AND s.ruleset_id = ANY(st.chain)
     )
     SELECT DISTINCT pk.char_name AS "charName", pk.step, e.name AS "entityName", pool.name AS "poolName",
            ers.name AS "entityRuleset"
       FROM picked pk
       JOIN rules.entities e ON e.id = pk.entity_id
       JOIN rules.rulesets ers ON ers.id = e.ruleset_id
       JOIN rules.entities pool ON pool.id = pk.via_id
      WHERE NOT EXISTS (
        SELECT 1
          FROM rules.link_roles r
          JOIN standing se ON se.character_id = pk.character_id AND se.named_id = pk.entity_id
          JOIN standing sp ON sp.character_id = pk.character_id AND sp.named_id = pk.via_id
          JOIN rules.entity_links l ON l.from_id = se.id AND l.to_id = sp.id AND l.role = r.role
         WHERE r.from_type = pk.entity_type AND r.to_type = pk.via_type)`,
  );
  if (unlisted.length === 0) {
    console.log("✓ picks through pools");
    return 0;
  }
  console.error(`✗ picks through pools: ${unlisted.length} pick(s) of an entity the pool doesn't list`);
  for (const row of unlisted) {
    console.error(
      `    ${row.charName}: ${row.step} "${row.entityName}" (${row.entityRuleset}) + pool "${row.poolName}"`,
    );
  }
  return unlisted.length;
}
