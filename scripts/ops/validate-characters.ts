import { isNull } from "drizzle-orm";

import { charactersInCharacter } from "@/drizzle/schema.ts";
import { checkAbilityIncreases } from "@/scripts/ops/validateCharacters/abilityIncreases.ts";
import { checkBuilds } from "@/scripts/ops/validateCharacters/builds.ts";
import { printCharacterData } from "@/scripts/ops/validateCharacters/characterData.ts";
import { checkJunctions } from "@/scripts/ops/validateCharacters/junctions.ts";
import { checkReferences } from "@/scripts/ops/validateCharacters/references.ts";
/**
 * Validates every active character:
 *  1. Reference integrity — every FK points to an existing, non-deleted entity
 *  2. Junction validity  — feat+aptitude and power+aptitude combos exist in junction tables
 *  3. Ability increases  — on the levels its ruleset gives one, and only there
 *  4. Build integrity    — DetailedCharacter.build() + validate()
 *
 * Usage: bun run prod:validate-characters (or DATABASE_URL=… bun scripts/ops/validate-characters.ts)
 */
import { db } from "@/server/database/index.ts";

async function main() {
  const characters = await db.select().from(charactersInCharacter).where(isNull(charactersInCharacter.deletedAt));
  if (characters.length === 0) {
    console.log("No characters to validate.");
    process.exit(0);
  }
  console.log(`Validating ${characters.length} characters...\n`);
  await printCharacterData(characters);

  const totalIssues =
    (await checkReferences()) +
    (await checkJunctions()) +
    (await checkAbilityIncreases(characters)) +
    (await checkBuilds(characters));
  console.log(
    totalIssues > 0
      ? `\n${totalIssues} issue(s) found across ${characters.length} character(s).`
      : `\nAll ${characters.length} characters pass all checks.`,
  );
  process.exit(totalIssues > 0 ? 1 : 0);
}

await main();
