import { getTableName, type SQL, sql, type Table } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import {
  advancementPicksInCharacter,
  advancementsInCharacter,
  inventoryInCharacter,
  linksInCharacter,
} from "@/drizzle/schema.ts";
import {
  ENTITY_REFERENCES,
  type EntityReference,
  type ReferenceOwner,
} from "@/server/repositories/rulesets/entityReferences.ts";

import { CHAIN, query } from "./queries.ts";

/** A check of the rows a character holds that name an entity in one column: its label, and its broken rows' query. */
interface ReferenceCheck {
  label: string;
  sql: SQL;
}

/**
 * What a character's row naming an entity is, shown beside the entity it names: a link's role, a level's entry, a
 * pick's step, an item's type. A row of a table it doesn't list shows the column naming the entity.
 */
const ROW_KINDS = new Map<Table, PgColumn>([
  [advancementPicksInCharacter, advancementPicksInCharacter.step],
  [advancementsInCharacter, advancementsInCharacter.entryType],
  [inventoryInCharacter, inventoryInCharacter.itemType],
  [linksInCharacter, linksInCharacter.role],
]);

/** The join from a row naming an entity to its character (`c`): its own, or its level's; none for an entity's or a ruleset's row. */
function characterJoin(owner: ReferenceOwner): SQL | undefined {
  if ("characterId" in owner) return sql`JOIN character.characters c ON c.id = ${owner.characterId}`;
  if ("advancementId" in owner) {
    return sql`JOIN character.advancements a ON a.id = ${owner.advancementId}
          JOIN character.characters c ON c.id = a.character_id`;
  }
  return undefined;
}

/** The check of a character's rows naming an entity (`e`) in `column`, or none for rows that aren't a character's. */
function checkOf({ column, owner }: EntityReference): ReferenceCheck | undefined {
  const character = characterJoin(owner);
  if (!character) return undefined;

  const kind = ROW_KINDS.get(column.table) ?? sql`${column.name}::text`;
  return {
    label: `${getTableName(column.table)}.${column.name} → entity`,
    sql: sql`SELECT c.id, c.name, ${kind} AS "what", ${column} AS "entityId"
          FROM ${column.table}
          ${character}
          JOIN rules.entities e ON e.id = ${column}
          WHERE c.deleted_at IS NULL AND NOT e.ruleset_id = ANY(${CHAIN}::uuid[])`,
  };
}

/**
 * Phase 1: every entity a character's rows name (`ENTITY_REFERENCES`: its links, its levels, their picks, its
 * inventory) is of its ruleset chain: its ruleset, its extensions, the rulesets it's forked from, which its ruleset's
 * view reads (an entity of another ruleset, the view leaves out; the database refuses a dangling one). Returns the
 * issues found.
 */
export async function checkReferences() {
  console.log("═══ Phase 1: Reference Scope ═══\n");
  let issues = 0;
  for (const check of ENTITY_REFERENCES.map(checkOf)) {
    if (!check) continue;
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
