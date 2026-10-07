import { rulesetsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

import type { Character } from "./queries.ts";
import { moduleOf } from "./rulesetModules.ts";

/** Phase 4: every character builds and validates. Returns the integrity issues found. */
export async function checkBuilds(characters: Character[]) {
  console.log("\n═══ Phase 4: Build Integrity ═══\n");
  let issues = 0;
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

        issues += integrityIssues.length;

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
    } catch (error) {
      issues++;
      console.error(`✗ ${char.name}: BUILD FAILED — ${error instanceof Error ? error.message : error}`);
    }
  }
  return issues;
}
