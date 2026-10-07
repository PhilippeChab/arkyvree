import { getAttributeSlots } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cache/rulesetCache/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";

import type { Character } from "./queries.ts";

/**
 * Phase 3: Ability increases — on the levels the ruleset gives one
 * Saving a level checks it (finalize.ts), but older rows can carry an
 * increase where none is due, or miss a due one. DetailedCharacter.validate()
 * doesn't flag either, while re-saving such a level throws: the user is stuck.
 * A level is due one when its edit's attributes step offers one.
 */
export async function checkAbilityIncreases(characters: Character[]) {
  console.log("\n═══ Phase 3: Ability Increases ═══\n");
  let issues = 0;

  for (const char of characters) {
    // A bonded creature's levels are its master's to plan
    if (char.parentCharacterId) continue;
    await withRulesetScope(db, char.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, char);
      for (const [index, level] of character.rows.levels.entries()) {
        const due = getAttributeSlots(scope, character, level.id).isAvailable;
        if (due === (level.abilityId !== null)) continue;
        issues++;
        const klassLevel = scope.rulesetData.klassLevelsById.get(level.klassLevelId);
        const klass = klassLevel && scope.rulesetData.klassesById.get(klassLevel.klassId);
        const which = `level ${index + 1} (${klass?.name} ${klassLevel?.level})`;
        console.error(`    ${char.name}: ${which} ${due ? "misses its" : "has an unexpected"} ability increase`);
      }
    });
  }

  console.log(issues > 0 ? `✗ ability increases: ${issues} level(s)` : "✓ ability increases");
  return issues;
}
