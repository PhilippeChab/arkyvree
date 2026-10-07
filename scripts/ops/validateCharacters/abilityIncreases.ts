import { asc, eq, isNull } from "drizzle-orm";

import { klassesInRules, klassLevelsInRules, levelsInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

import type { Character } from "./queries.ts";
import { moduleOf } from "./rulesetModules.ts";

/**
 * Phase 3: Ability increases — on the levels the ruleset gives one
 * Saving a level checks it (finalize.ts), but older rows can carry an
 * increase where none is due, or miss a due one. DetailedCharacter.validate()
 * doesn't flag either, while re-saving such a level throws: the user is stuck.
 */
export async function checkAbilityIncreases(characters: Character[]) {
  console.log("\n═══ Phase 3: Ability Increases ═══\n");
  let issues = 0;
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

  for (const char of characters) {
    if (char.kind !== "pc") continue;
    const { rules } = await moduleOf(char.rulesetId);
    // A level's position, by creation, is what the ruleset's rule reads (0 for the first)
    for (const [position, level] of levels.filter((l) => l.characterId === char.id).entries()) {
      const due = rules.levels.isAbilityIncreaseLevel(position);
      if (due === (level.abilityId !== null)) continue;
      issues++;
      const which = `level ${position + 1} (${level.klass} ${level.klassLevel})`;
      console.error(`    ${char.name}: ${which} ${due ? "misses its" : "has an unexpected"} ability increase`);
    }
  }

  console.log(issues > 0 ? `✗ ability increases: ${issues} level(s)` : "✓ ability increases");
  return issues;
}
