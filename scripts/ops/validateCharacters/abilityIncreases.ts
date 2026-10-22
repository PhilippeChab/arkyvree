import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";

import type { Character } from "./queries.ts";

/**
 * Phase 3: Ability increases — on the levels the ruleset gives one
 * Saving a level checks it, but older rows, or a ruleset whose
 * Settings since moved its increases, can miss a due one, which
 * DetailedCharacter.validate() doesn't flag. A level is due one when its
 * edit's plan has a choice to make at it (3.5's ability increase step). An increase where none is due counts for
 * nothing and its level's edit writes it away, so it's no issue.
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
        // Its edit's plan, answering nothing (a pick a reference check flags would refuse the saved one): a `choose`
        // step that takes a choice at the level makes one due. A level the plan can't read (its class level gone, which
        // the reference check reports) is skipped, and logged
        let due: boolean;
        try {
          const answer = Engine.for(scope)
            .character(character)
            .levelUp()
            .describePlan({ editedLevelId: level.id, steps: {} });
          due = Object.values(answer.steps).some((step) => step.mechanic === "choose" && step.advancements.length > 0);
        } catch (error) {
          console.warn(
            `    ${char.name}: level ${index + 1} skipped — ${error instanceof Error ? error.message : error}`,
          );
          continue;
        }
        const increased = character.rows.picks.abilityIncreases.some((row) => row.characterLevelId === level.id);
        if (!due || increased) continue;
        issues++;
        const klassLevel = scope.rulesetData.klassLevelsById.get(level.klassLevelId);
        const klass = klassLevel && scope.rulesetData.klassesById.get(klassLevel.klassId);
        const which = `level ${index + 1} (${klass?.name} ${klassLevel?.level})`;
        console.error(`    ${char.name}: ${which} misses its ability increase`);
      }
    });
  }

  console.log(issues > 0 ? `✗ ability increases: ${issues} level(s)` : "✓ ability increases");
  return issues;
}
