import { rulesetsInRules } from "@/drizzle/schema.ts";
import { describeCharacter } from "@/engine/index.ts";
import { readCharacterInput } from "@/server/builds/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";

import type { Character } from "./queries.ts";

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
    // A bonded creature's sheet is its master's
    if (char.parentCharacterId) continue;
    try {
      const ruleset = rulesetNames.get(char.rulesetId);
      const { validation } = await withRulesetScope(db, char.rulesetId, async (scope) =>
        describeCharacter(scope, await readCharacterInput(db, char), []),
      );

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
