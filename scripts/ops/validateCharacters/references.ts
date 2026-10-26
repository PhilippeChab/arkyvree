import { sql, type SQL } from "drizzle-orm";

import { CHAIN, query } from "./queries.ts";

/**
 * Each row a character holds that names an entity (`e`), by what it is (its role, its step, its track, its item): the
 * database refuses a dangling one, so what's checked is that it names an entity of the character's ruleset chain, which
 * its ruleset's view reads (an entity of another ruleset, the view leaves out).
 */
const refChecks: { label: string; sql: SQL }[] = [
  {
    label: "character link → entity",
    sql: sql`SELECT c.id, c.name, l.role AS "what", l.entity_id AS "entityId"
          FROM character.links l
          JOIN character.characters c ON c.id = l.character_id
          JOIN rules.entities e ON e.id = l.entity_id
          WHERE c.deleted_at IS NULL AND NOT e.ruleset_id = ANY(${CHAIN}::uuid[])`,
  },
  {
    label: "advancement → track",
    sql: sql`SELECT c.id, c.name, a.track_type AS "what", a.track_id AS "entityId"
          FROM character.advancements a
          JOIN character.characters c ON c.id = a.character_id
          JOIN rules.entities e ON e.id = a.track_id
          WHERE c.deleted_at IS NULL AND NOT e.ruleset_id = ANY(${CHAIN}::uuid[])`,
  },
  {
    label: "pick → entity or pool",
    sql: sql`SELECT c.id, c.name, p.step AS "what", e.id AS "entityId"
          FROM character.advancement_picks p
          JOIN character.advancements a ON a.id = p.advancement_id
          JOIN character.characters c ON c.id = a.character_id
          JOIN rules.entities e ON e.id IN (p.entity_id, p.via_id)
          WHERE c.deleted_at IS NULL AND NOT e.ruleset_id = ANY(${CHAIN}::uuid[])`,
  },
  {
    label: "inventory → item",
    sql: sql`SELECT c.id, c.name, inv.item_type AS "what", inv.item_id AS "entityId"
          FROM character.inventory inv
          JOIN character.characters c ON c.id = inv.character_id
          JOIN rules.entities e ON e.id = inv.item_id
          WHERE c.deleted_at IS NULL AND NOT e.ruleset_id = ANY(${CHAIN}::uuid[])`,
  },
];

/**
 * Phase 1: every entity a character's rows name is of its ruleset chain: its ruleset, its extensions, the rulesets it's
 * forked from. Returns the issues found.
 */
export async function checkReferences() {
  console.log("═══ Phase 1: Reference Scope ═══\n");
  let issues = 0;
  for (const check of refChecks) {
    const broken = await query<{ entityId: string; id: string; name: string; what: string }>(check.sql);
    if (broken.length > 0) {
      issues += broken.length;
      console.error(`✗ ${check.label}: ${broken.length} reference(s) outside the character's ruleset chain`);
      for (const row of broken) console.error(`    ${row.name}: ${row.what} ${row.entityId}`);
    } else {
      console.log(`✓ ${check.label}`);
    }
  }
  return issues;
}
