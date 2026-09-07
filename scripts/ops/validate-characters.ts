/**
 * Validates all active characters:
 *  1. Reference integrity — every FK points to an existing, non-deleted entity
 *  2. Junction validity  — feat+aptitude and power+aptitude combos exist in junction tables
 *  3. Build integrity    — DetailedCharacter.build() + validate()
 *
 * Usage: DATABASE_URL=... bun run scripts/ops/validate-characters.ts
 */
import { db } from "@/server/database/index.ts";
import { charactersInCharacter, rulesetsInRules } from "@/drizzle/schema.ts";
import { eq, isNull, sql } from "drizzle-orm";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

async function query<T>(q: string): Promise<T[]> {
  const result: unknown = await db.execute(sql.raw(q));
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return result as T[];
}

function uuidArr(ids: string[]): string {
  if (ids.length === 0) return "'{}'::uuid[]";
  return `ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}]`;
}

// ──────────────────────────────────────────────────────────────
// Load characters
// ──────────────────────────────────────────────────────────────

const characters = await db
  .select()
  .from(charactersInCharacter)
  .where(isNull(charactersInCharacter.deletedAt));

if (characters.length === 0) {
  console.log("No characters to validate.");
  process.exit(0);
}

const charIds = characters.map((c) => c.id);
const charArr = uuidArr(charIds);
const levelSubq = `(SELECT id FROM character.levels WHERE character_id = ANY(${charArr}) AND deleted_at IS NULL)`;

console.log(`Validating ${characters.length} characters...\n`);

// ──────────────────────────────────────────────────────────────
// Data counts (mirrors migrate-packages countCharacterData)
// ──────────────────────────────────────────────────────────────

const [counts] = await query<{
  levels: string;
  feats: string;
  skills: string;
  powers: string;
  abilities: string;
  languages: string;
  inventory: string;
}>(`SELECT
     (SELECT count(*) FROM character.levels WHERE character_id = ANY(${charArr}) AND deleted_at IS NULL)::text AS levels,
     (SELECT count(*) FROM character.level_feats WHERE character_level_id IN ${levelSubq} AND deleted_at IS NULL)::text AS feats,
     (SELECT count(*) FROM character.level_skills WHERE character_level_id IN ${levelSubq} AND deleted_at IS NULL)::text AS skills,
     (SELECT count(*) FROM character.level_powers WHERE character_level_id IN ${levelSubq} AND deleted_at IS NULL)::text AS powers,
     (SELECT count(*) FROM character.character_abilities WHERE character_id = ANY(${charArr}) AND deleted_at IS NULL)::text AS abilities,
     (SELECT count(*) FROM character.languages WHERE character_id = ANY(${charArr}) AND deleted_at IS NULL)::text AS languages,
     (SELECT count(*) FROM character.inventory WHERE character_id = ANY(${charArr}) AND deleted_at IS NULL)::text AS inventory`);

console.log("Character data:");
console.log(`  characters: ${characters.length}, levels: ${counts.levels}, feats: ${counts.feats}`);
console.log(`  skills: ${counts.skills}, powers: ${counts.powers}, inventory: ${counts.inventory}`);
console.log(`  abilities: ${counts.abilities}, languages: ${counts.languages}\n`);

let totalIssues = 0;

// ══════════════════════════════════════════════════════════════
// Phase 1: Reference integrity — dangling FKs
// ══════════════════════════════════════════════════════════════

console.log("═══ Phase 1: Reference Integrity ═══\n");

const refChecks: { label: string; sql: string }[] = [
  {
    label: "character → race",
    sql: `SELECT c.id, c.name, c.race_id as "entityId"
          FROM character.characters c
          LEFT JOIN rules.races r ON r.id = c.race_id AND r.deleted_at IS NULL
          WHERE c.id = ANY(${charArr}) AND c.deleted_at IS NULL
            AND c.race_id IS NOT NULL AND r.id IS NULL`,
  },
  {
    label: "level → klass_level",
    sql: `SELECT c.id, c.name, l.klass_level_id as "entityId"
          FROM character.levels l
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.klass_levels kl ON kl.id = l.klass_level_id AND kl.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND l.deleted_at IS NULL
            AND kl.id IS NULL`,
  },
  {
    label: "level → ability",
    sql: `SELECT c.id, c.name, l.ability_id as "entityId"
          FROM character.levels l
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.abilities a ON a.id = l.ability_id AND a.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND l.deleted_at IS NULL
            AND l.ability_id IS NOT NULL AND a.id IS NULL`,
  },
  {
    label: "level_feat → feat",
    sql: `SELECT c.id, c.name, lf.feat_id as "entityId"
          FROM character.level_feats lf
          JOIN character.levels l ON l.id = lf.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.feats f ON f.id = lf.feat_id AND f.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND lf.deleted_at IS NULL
            AND f.id IS NULL`,
  },
  {
    label: "level_feat → aptitude",
    sql: `SELECT c.id, c.name, lf.aptitude_id as "entityId"
          FROM character.level_feats lf
          JOIN character.levels l ON l.id = lf.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.aptitudes apt ON apt.id = lf.aptitude_id AND apt.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND lf.deleted_at IS NULL
            AND apt.id IS NULL`,
  },
  {
    label: "level_skill → skill",
    sql: `SELECT c.id, c.name, ls.skill_id as "entityId"
          FROM character.level_skills ls
          JOIN character.levels l ON l.id = ls.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.skills s ON s.id = ls.skill_id AND s.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND ls.deleted_at IS NULL
            AND s.id IS NULL`,
  },
  {
    label: "level_power → power",
    sql: `SELECT c.id, c.name, lp.power_id as "entityId"
          FROM character.level_powers lp
          JOIN character.levels l ON l.id = lp.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.powers p ON p.id = lp.power_id AND p.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND lp.deleted_at IS NULL
            AND p.id IS NULL`,
  },
  {
    label: "level_power → aptitude",
    sql: `SELECT c.id, c.name, lp.aptitude_id as "entityId"
          FROM character.level_powers lp
          JOIN character.levels l ON l.id = lp.character_level_id
          JOIN character.characters c ON c.id = l.character_id
          LEFT JOIN rules.aptitudes apt ON apt.id = lp.aptitude_id AND apt.deleted_at IS NULL
          WHERE l.character_id = ANY(${charArr}) AND lp.deleted_at IS NULL
            AND apt.id IS NULL`,
  },
  {
    label: "character_ability → ability",
    sql: `SELECT c.id, c.name, ca.ability_id as "entityId"
          FROM character.character_abilities ca
          JOIN character.characters c ON c.id = ca.character_id
          LEFT JOIN rules.abilities a ON a.id = ca.ability_id AND a.deleted_at IS NULL
          WHERE ca.character_id = ANY(${charArr}) AND ca.deleted_at IS NULL
            AND a.id IS NULL`,
  },
  {
    label: "language → language",
    sql: `SELECT c.id, c.name, cl.language_id as "entityId"
          FROM character.languages cl
          JOIN character.characters c ON c.id = cl.character_id
          LEFT JOIN rules.languages l ON l.id = cl.language_id AND l.deleted_at IS NULL
          WHERE cl.character_id = ANY(${charArr}) AND cl.deleted_at IS NULL
            AND l.id IS NULL`,
  },
  {
    label: "inventory → item",
    sql: `SELECT c.id, c.name, inv.item_id as "entityId"
          FROM character.inventory inv
          JOIN character.characters c ON c.id = inv.character_id
          LEFT JOIN rules.items i ON i.id = inv.item_id AND i.deleted_at IS NULL
          WHERE inv.character_id = ANY(${charArr}) AND inv.deleted_at IS NULL
            AND i.id IS NULL`,
  },
];

for (const check of refChecks) {
  const broken = await query<{ id: string; name: string; entityId: string }>(check.sql);
  if (broken.length > 0) {
    totalIssues += broken.length;
    console.error(`✗ ${check.label}: ${broken.length} dangling reference(s)`);
    for (const row of broken) console.error(`    ${row.name}: ${row.entityId}`);
  } else {
    console.log(`✓ ${check.label}`);
  }
}

// ══════════════════════════════════════════════════════════════
// Phase 2: Junction validity — feat+aptitude, power+aptitude
// ══════════════════════════════════════════════════════════════

console.log("\n═══ Phase 2: Junction Validity ═══\n");

// Every (feat_id, aptitude_id) in level_feats should exist in feats_aptitudes
const badFeatCombos = await query<{
  charName: string;
  featName: string;
  aptName: string;
  featRuleset: string;
}>(
  `SELECT DISTINCT c.name as "charName", f.name as "featName",
          apt.name as "aptName", frs.name as "featRuleset"
   FROM character.level_feats lf
   JOIN character.levels l ON l.id = lf.character_level_id
   JOIN character.characters c ON c.id = l.character_id
   JOIN rules.feats f ON f.id = lf.feat_id
   JOIN rules.rulesets frs ON frs.id = f.ruleset_id
   JOIN rules.aptitudes apt ON apt.id = lf.aptitude_id
   LEFT JOIN rules.feats_aptitudes fa
     ON fa.feat_id = lf.feat_id AND fa.aptitude_id = lf.aptitude_id
   WHERE l.character_id = ANY(${charArr}) AND lf.deleted_at IS NULL
     AND fa.feat_id IS NULL`,
);

if (badFeatCombos.length > 0) {
  totalIssues += badFeatCombos.length;
  console.error(`✗ feat+aptitude: ${badFeatCombos.length} invalid combo(s)`);
  for (const row of badFeatCombos) {
    console.error(`    ${row.charName}: feat "${row.featName}" (${row.featRuleset}) + aptitude "${row.aptName}"`);
  }
} else {
  console.log("✓ feat+aptitude combos");
}

// Every (power_id, aptitude_id) in level_powers should exist in powers_aptitudes
const badPowerCombos = await query<{
  charName: string;
  powerName: string;
  aptName: string;
  powerRuleset: string;
}>(
  `SELECT DISTINCT c.name as "charName", p.name as "powerName",
          apt.name as "aptName", prs.name as "powerRuleset"
   FROM character.level_powers lp
   JOIN character.levels l ON l.id = lp.character_level_id
   JOIN character.characters c ON c.id = l.character_id
   JOIN rules.powers p ON p.id = lp.power_id
   JOIN rules.rulesets prs ON prs.id = p.ruleset_id
   JOIN rules.aptitudes apt ON apt.id = lp.aptitude_id
   LEFT JOIN rules.powers_aptitudes pa
     ON pa.power_id = lp.power_id AND pa.aptitude_id = lp.aptitude_id
   WHERE l.character_id = ANY(${charArr}) AND lp.deleted_at IS NULL
     AND pa.power_id IS NULL`,
);

if (badPowerCombos.length > 0) {
  totalIssues += badPowerCombos.length;
  console.error(`✗ power+aptitude: ${badPowerCombos.length} invalid combo(s)`);
  for (const row of badPowerCombos) {
    console.error(`    ${row.charName}: power "${row.powerName}" (${row.powerRuleset}) + aptitude "${row.aptName}"`);
  }
} else {
  console.log("✓ power+aptitude combos");
}

// ══════════════════════════════════════════════════════════════
// Phase 2.5: Ability increase position (D&D 3.5)
// ══════════════════════════════════════════════════════════════
// SRD: PCs get an ability score increase every 4 levels (char L4, L8,
// L12, L16, L20). Save-side validation (finalize.ts) has enforced this
// since 2026-04-06, but pre-existing rows can still carry abilityId on
// a non-bump position, or be missing one on a bump position. Both states
// are silent — DetailedCharacter.validate() doesn't flag them — but
// trying to re-save the level through updateLevel will now throw, so the
// user gets stuck. Surface the affected rows here.

console.log("\n═══ Phase 2.5: Ability Increase Position ═══\n");

const abilityPositionIssues = await query<{
  charName: string;
  position: string;
  klassName: string;
  klassLevel: string;
  hasAbility: boolean;
  abilityName: string | null;
  kind: "misaligned" | "missing";
}>(
  `WITH ordered AS (
     SELECT
       l.id,
       l.character_id,
       l.ability_id,
       ROW_NUMBER() OVER (PARTITION BY l.character_id ORDER BY l.created_at)::int AS position,
       c.name AS char_name,
       kl.level AS klass_level,
       k.name AS klass_name
     FROM character.levels l
     JOIN character.characters c ON c.id = l.character_id
     JOIN rules.klass_levels kl ON kl.id = l.klass_level_id
     JOIN rules.klasses k ON k.id = kl.klass_id
     WHERE l.character_id = ANY(${charArr})
       AND l.deleted_at IS NULL
       AND c.kind = 'pc'
   )
   SELECT
     o.char_name AS "charName",
     o.position::text AS position,
     o.klass_name AS "klassName",
     o.klass_level::text AS "klassLevel",
     (o.ability_id IS NOT NULL) AS "hasAbility",
     a.name AS "abilityName",
     CASE
       WHEN o.ability_id IS NOT NULL AND o.position % 4 != 0 THEN 'misaligned'
       ELSE 'missing'
     END AS kind
   FROM ordered o
   LEFT JOIN rules.abilities a ON a.id = o.ability_id
   WHERE (o.ability_id IS NOT NULL AND o.position % 4 != 0)
      OR (o.ability_id IS NULL AND o.position % 4 = 0)
   ORDER BY o.char_name, o.position`,
);

if (abilityPositionIssues.length > 0) {
  totalIssues += abilityPositionIssues.length;
  const misaligned = abilityPositionIssues.filter((r) => r.kind === "misaligned");
  const missing = abilityPositionIssues.filter((r) => r.kind === "missing");
  if (misaligned.length > 0) {
    console.error(`✗ ability increase on non-bump level: ${misaligned.length} row(s)`);
    for (const row of misaligned) {
      console.error(`    ${row.charName}: char L${row.position} (${row.klassName} L${row.klassLevel}) has ability "${row.abilityName ?? "<unknown>"}"`);
    }
  }
  if (missing.length > 0) {
    console.error(`✗ ability increase missing on bump level: ${missing.length} row(s)`);
    for (const row of missing) {
      console.error(`    ${row.charName}: char L${row.position} (${row.klassName} L${row.klassLevel}) has no ability_id`);
    }
  }
} else {
  console.log("✓ ability increase positions");
}

// ══════════════════════════════════════════════════════════════
// Phase 3: Build integrity — build + validate per character
// ══════════════════════════════════════════════════════════════

console.log("\n═══ Phase 3: Build Integrity ═══\n");

for (const char of characters) {
  if (char.kind !== "pc") continue;
  try {
    const [ruleset] = await db
      .select({ name: rulesetsInRules.name })
      .from(rulesetsInRules)
      .where(eq(rulesetsInRules.id, char.rulesetId));

    const rulesetModule = await RulesetFactory.fromRulesetId(char.rulesetId);
    const detailed = rulesetModule.createDetailedCharacter(char) as Dnd35DetailedCharacter;
    await detailed.build();
    const validation = detailed.validate();

    if (!validation.valid) {
      const integrityIssues = validation.issues.filter((i) => i.category === "integrity");
      const otherIssues = validation.issues.filter((i) => i.category !== "integrity");

      totalIssues += integrityIssues.length;

      if (integrityIssues.length > 0) {
        console.error(`✗ ${char.name} (${ruleset?.name}):`);
        for (const issue of integrityIssues) console.error(`  [integrity] ${issue.message}`);
        for (const issue of otherIssues) console.warn(`  [${issue.category}] ${issue.message}`);
      } else {
        // Only non-integrity issues — report as warning
        console.warn(`⚠ ${char.name} (${ruleset?.name}):`);
        for (const issue of otherIssues) console.warn(`  [${issue.category}] ${issue.message}`);
      }
    } else {
      console.log(`✓ ${char.name} (${ruleset?.name})`);
    }
  } catch (err) {
    totalIssues++;
    console.error(`✗ ${char.name}: BUILD FAILED — ${err instanceof Error ? err.message : err}`);
  }
}

// ──────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────

console.log(
  totalIssues > 0
    ? `\n${totalIssues} issue(s) found across ${characters.length} character(s).`
    : `\nAll ${characters.length} characters pass all checks.`,
);
process.exit(totalIssues > 0 ? 1 : 0);
