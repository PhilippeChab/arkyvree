import { sql } from "drizzle-orm";

import { query } from "@/scripts/ops/validateCharacters/queries.ts";

/** Phase 2: every feat and power a level picked is one its aptitude offers. Returns the issues found. */
export async function checkJunctions() {
  console.log("\n═══ Phase 2: Junction Validity ═══\n");
  let issues = 0;
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
    issues += badFeatCombos.length;
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
    issues += badPowerCombos.length;
    console.error(`✗ power+aptitude: ${badPowerCombos.length} invalid combo(s)`);
    for (const row of badPowerCombos) {
      console.error(`    ${row.charName}: power "${row.powerName}" (${row.powerRuleset}) + aptitude "${row.aptName}"`);
    }
  } else {
    console.log("✓ power+aptitude combos");
  }
  return issues;
}
