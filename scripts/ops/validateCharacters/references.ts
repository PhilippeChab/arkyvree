import { sql, type SQL } from "drizzle-orm";

import { query } from "./queries.ts";

const refChecks: { label: string; sql: SQL }[] = [
  {
    label: "character → race",
    sql: sql`SELECT c.id, c.name, c.race_id as "entityId"
          FROM character.characters c
          LEFT JOIN rules.races r ON r.id = c.race_id AND r.deleted_at IS NULL
          WHERE c.deleted_at IS NULL
            AND c.race_id IS NOT NULL AND r.id IS NULL`,
  },
  {
    label: "level → klass_level",
    sql: sql`SELECT c.id, c.name, l.klass_level_id as "entityId"
          FROM character.levels l
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.klass_levels kl ON kl.id = l.klass_level_id AND kl.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND l.deleted_at IS NULL
            AND kl.id IS NULL`,
  },
  {
    label: "level → ability",
    sql: sql`SELECT c.id, c.name, l.ability_id as "entityId"
          FROM character.levels l
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.abilities a ON a.id = l.ability_id AND a.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND l.deleted_at IS NULL
            AND l.ability_id IS NOT NULL AND a.id IS NULL`,
  },
  {
    label: "level_feat → feat",
    sql: sql`SELECT c.id, c.name, lf.feat_id as "entityId"
          FROM character.level_feats lf
          JOIN character.levels l ON l.id = lf.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.feats f ON f.id = lf.feat_id AND f.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND lf.deleted_at IS NULL
            AND f.id IS NULL`,
  },
  {
    label: "level_feat → aptitude",
    sql: sql`SELECT c.id, c.name, lf.aptitude_id as "entityId"
          FROM character.level_feats lf
          JOIN character.levels l ON l.id = lf.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.aptitudes apt ON apt.id = lf.aptitude_id AND apt.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND lf.deleted_at IS NULL
            AND apt.id IS NULL`,
  },
  {
    label: "level_skill → skill",
    sql: sql`SELECT c.id, c.name, ls.skill_id as "entityId"
          FROM character.level_skills ls
          JOIN character.levels l ON l.id = ls.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.skills s ON s.id = ls.skill_id AND s.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND ls.deleted_at IS NULL
            AND s.id IS NULL`,
  },
  {
    label: "level_power → power",
    sql: sql`SELECT c.id, c.name, lp.power_id as "entityId"
          FROM character.level_powers lp
          JOIN character.levels l ON l.id = lp.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.powers p ON p.id = lp.power_id AND p.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND lp.deleted_at IS NULL
            AND p.id IS NULL`,
  },
  {
    label: "level_power → aptitude",
    sql: sql`SELECT c.id, c.name, lp.aptitude_id as "entityId"
          FROM character.level_powers lp
          JOIN character.levels l ON l.id = lp.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.aptitudes apt ON apt.id = lp.aptitude_id AND apt.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND lp.deleted_at IS NULL
            AND apt.id IS NULL`,
  },
  {
    label: "character_ability → ability",
    sql: sql`SELECT c.id, c.name, ca.ability_id as "entityId"
          FROM character.character_abilities ca
          JOIN character.characters c ON c.id = ca.character_id
          LEFT JOIN rules.abilities a ON a.id = ca.ability_id AND a.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND ca.deleted_at IS NULL
            AND a.id IS NULL`,
  },
  {
    label: "language → language",
    sql: sql`SELECT c.id, c.name, cl.language_id as "entityId"
          FROM character.languages cl
          JOIN character.characters c ON c.id = cl.character_id
          LEFT JOIN rules.languages l ON l.id = cl.language_id AND l.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND cl.deleted_at IS NULL
            AND l.id IS NULL`,
  },
  {
    label: "inventory → item",
    sql: sql`SELECT c.id, c.name, inv.item_id as "entityId"
          FROM character.inventory inv
          JOIN character.characters c ON c.id = inv.character_id
          LEFT JOIN rules.items i ON i.id = inv.item_id AND i.deleted_at IS NULL
          WHERE c.deleted_at IS NULL AND inv.deleted_at IS NULL
            AND i.id IS NULL`,
  },
];

/** Phase 1: every reference a character holds points to an existing, non-deleted row. Returns the issues found. */
export async function checkReferences() {
  console.log("═══ Phase 1: Reference Integrity ═══\n");
  let issues = 0;
  for (const check of refChecks) {
    const broken = await query<{ id: string; name: string; entityId: string }>(check.sql);
    if (broken.length > 0) {
      issues += broken.length;
      console.error(`✗ ${check.label}: ${broken.length} dangling reference(s)`);
      for (const row of broken) console.error(`    ${row.name}: ${row.entityId}`);
    } else {
      console.log(`✓ ${check.label}`);
    }
  }
  return issues;
}
