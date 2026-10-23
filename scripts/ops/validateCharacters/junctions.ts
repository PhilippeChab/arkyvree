import { sql } from "drizzle-orm";

import { query } from "./queries.ts";

/**
 * Phase 2: every entity a level picked through a pool (a feat through its aptitude, a spell through its list) is one
 * the pool lists: a link from the entity to the pool. Returns the issues found.
 */
export async function checkJunctions() {
  console.log("\n═══ Phase 2: Junction Validity ═══\n");
  const badCombos = await query<{
    charName: string;
    entityName: string;
    entityRuleset: string;
    poolName: string;
    step: string;
  }>(
    sql`SELECT DISTINCT c.name AS "charName", p.step, e.name AS "entityName",
            pool.name AS "poolName", ers.name AS "entityRuleset"
     FROM character.advancement_picks p
     JOIN character.advancements a ON a.id = p.advancement_id
     JOIN character.characters c ON c.id = a.character_id
     JOIN rules.entities e ON e.id = p.entity_id
     JOIN rules.rulesets ers ON ers.id = e.ruleset_id
     JOIN rules.entities pool ON pool.id = p.via_id
     LEFT JOIN rules.entity_links l ON l.from_id = p.entity_id AND l.to_id = p.via_id
     WHERE c.deleted_at IS NULL AND a.deleted_at IS NULL AND l.id IS NULL`,
  );
  if (badCombos.length === 0) {
    console.log("✓ pick+pool combos");
    return 0;
  }
  console.error(`✗ pick+pool: ${badCombos.length} invalid combo(s)`);
  for (const row of badCombos) {
    console.error(
      `    ${row.charName}: ${row.step} "${row.entityName}" (${row.entityRuleset}) + pool "${row.poolName}"`,
    );
  }
  return badCombos.length;
}
