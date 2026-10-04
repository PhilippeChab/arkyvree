/**
 * Validates every active character:
 *  1. Reference integrity — every FK points to an existing, non-deleted entity
 *  2. Junction validity  — feat+aptitude and power+aptitude combos exist in junction tables
 *  3. Ability increases  — on the levels its ruleset gives one, and only there
 *  4. Build integrity    — DetailedCharacter.build() + validate()
 *
 * Usage: bun run prod:validate-characters (or DATABASE_URL=… bun scripts/ops/validate-characters.ts)
 */
import { asc, eq, isNull, type SQL, sql } from "drizzle-orm";

import {
  charactersInCharacter,
  klassesInRules,
  klassLevelsInRules,
  levelsInCharacter,
  rulesetsInRules,
} from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { RulesetFactory } from "@/server/rulesets/RulesetFactory.ts";
import type { RulesetModule } from "@/server/rulesets/types.ts";

async function query<T extends Record<string, unknown>>(statement: SQL) {
  return (await db.execute<T>(statement)).rows;
}

/** Each ruleset's module, built once. */
const modules = new Map<string, Promise<RulesetModule>>();
function moduleOf(rulesetId: string): Promise<RulesetModule> {
  let module = modules.get(rulesetId);
  if (!module) {
    module = RulesetFactory.fromRulesetId(rulesetId);
    modules.set(rulesetId, module);
  }
  return module;
}

const characters = await db.select().from(charactersInCharacter).where(isNull(charactersInCharacter.deletedAt));

if (characters.length === 0) {
  console.log("No characters to validate.");
  process.exit(0);
}

// The active characters' rows, which every check below reads
const ACTIVE_CHARACTERS = sql`(SELECT id FROM character.characters WHERE deleted_at IS NULL)`;
const ACTIVE_LEVELS = sql`(SELECT id FROM character.levels WHERE character_id IN ${ACTIVE_CHARACTERS} AND deleted_at IS NULL)`;

console.log(`Validating ${characters.length} characters...\n`);

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

let totalIssues = 0;

// Phase 1: Reference integrity — dangling FKs

console.log("═══ Phase 1: Reference Integrity ═══\n");

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

// Phase 2: Junction validity — feat+aptitude, power+aptitude

console.log("\n═══ Phase 2: Junction Validity ═══\n");

// Every (feat_id, aptitude_id) in level_feats should exist in feats_aptitudes
const badFeatCombos = await query<{
  charName: string;
  featName: string;
  aptName: string;
  featRuleset: string;
}>(
  sql`SELECT DISTINCT c.name as "charName", f.name as "featName",
          apt.name as "aptName", frs.name as "featRuleset"
   FROM character.level_feats lf
   JOIN character.levels l ON l.id = lf.character_level_id
   JOIN character.characters c ON c.id = l.character_id
   JOIN rules.feats f ON f.id = lf.feat_id
   JOIN rules.rulesets frs ON frs.id = f.ruleset_id
   JOIN rules.aptitudes apt ON apt.id = lf.aptitude_id
   LEFT JOIN rules.feats_aptitudes fa
     ON fa.feat_id = lf.feat_id AND fa.aptitude_id = lf.aptitude_id
   WHERE c.deleted_at IS NULL AND lf.deleted_at IS NULL
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
  sql`SELECT DISTINCT c.name as "charName", p.name as "powerName",
          apt.name as "aptName", prs.name as "powerRuleset"
   FROM character.level_powers lp
   JOIN character.levels l ON l.id = lp.character_level_id
   JOIN character.characters c ON c.id = l.character_id
   JOIN rules.powers p ON p.id = lp.power_id
   JOIN rules.rulesets prs ON prs.id = p.ruleset_id
   JOIN rules.aptitudes apt ON apt.id = lp.aptitude_id
   LEFT JOIN rules.powers_aptitudes pa
     ON pa.power_id = lp.power_id AND pa.aptitude_id = lp.aptitude_id
   WHERE c.deleted_at IS NULL AND lp.deleted_at IS NULL
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

// Phase 3: Ability increases — on the levels the ruleset gives one
// Saving a level checks it (finalize.ts), but older rows can carry an
// increase where none is due, or miss a due one. DetailedCharacter.validate()
// doesn't flag either, while re-saving such a level throws: the user is stuck.

console.log("\n═══ Phase 3: Ability Increases ═══\n");

const levels = await db
  .select({
    characterId: levelsInCharacter.characterId,
    abilityId: levelsInCharacter.abilityId,
    klass: klassesInRules.name,
    klassLevel: klassLevelsInRules.level,
  })
  .from(levelsInCharacter)
  .innerJoin(klassLevelsInRules, eq(klassLevelsInRules.id, levelsInCharacter.klassLevelId))
  .innerJoin(klassesInRules, eq(klassesInRules.id, klassLevelsInRules.klassId))
  .where(isNull(levelsInCharacter.deletedAt))
  .orderBy(asc(levelsInCharacter.createdAt));

let increaseIssues = 0;
for (const char of characters) {
  if (char.kind !== "pc") continue;
  const { hooks } = await moduleOf(char.rulesetId);
  // A level's position, by creation, is what the ruleset's rule reads (0 for the first)
  for (const [position, level] of levels.filter((l) => l.characterId === char.id).entries()) {
    const due = hooks.levels.isAbilityIncreaseLevel(position);
    if (due === (level.abilityId !== null)) continue;
    increaseIssues++;
    const which = `level ${position + 1} (${level.klass} ${level.klassLevel})`;
    console.error(`    ${char.name}: ${which} ${due ? "misses its" : "has an unexpected"} ability increase`);
  }
}

totalIssues += increaseIssues;
console.log(increaseIssues > 0 ? `✗ ability increases: ${increaseIssues} level(s)` : "✓ ability increases");

// Phase 4: Build integrity — build + validate per character

console.log("\n═══ Phase 4: Build Integrity ═══\n");

const rulesetNames = new Map(
  (await db.select({ id: rulesetsInRules.id, name: rulesetsInRules.name }).from(rulesetsInRules)).map((r) => [
    r.id,
    r.name,
  ]),
);

for (const char of characters) {
  if (char.kind !== "pc") continue;
  try {
    const ruleset = rulesetNames.get(char.rulesetId);
    const detailed = (await moduleOf(char.rulesetId)).createDetailedCharacter(char);
    await detailed.build();
    const validation = detailed.validate();

    if (!validation.valid) {
      const integrityIssues = validation.issues.filter((i) => i.category === "integrity");
      const otherIssues = validation.issues.filter((i) => i.category !== "integrity");

      totalIssues += integrityIssues.length;

      if (integrityIssues.length > 0) {
        console.error(`✗ ${char.name} (${ruleset}):`);
        for (const issue of integrityIssues) console.error(`  [integrity] ${issue.message}`);
        for (const issue of otherIssues) console.warn(`  [${issue.category}] ${issue.message}`);
      } else {
        // Only non-integrity issues — report as warning
        console.warn(`⚠ ${char.name} (${ruleset}):`);
        for (const issue of otherIssues) console.warn(`  [${issue.category}] ${issue.message}`);
      }
    } else {
      console.log(`✓ ${char.name} (${ruleset})`);
    }
  } catch (err) {
    totalIssues++;
    console.error(`✗ ${char.name}: BUILD FAILED — ${err instanceof Error ? err.message : err}`);
  }
}

console.log(
  totalIssues > 0
    ? `\n${totalIssues} issue(s) found across ${characters.length} character(s).`
    : `\nAll ${characters.length} characters pass all checks.`,
);
process.exit(totalIssues > 0 ? 1 : 0);
