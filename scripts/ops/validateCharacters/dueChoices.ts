import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * Phase 3: Due choices — on the levels the ruleset gives one (3.5's ability increases)
 * Saving a level checks it, but older rows, or a ruleset whose Settings since moved its choices, can miss a due one,
 * which a character's validation doesn't flag. A level is due one when its edit's plan has a `choose` step that takes
 * a choice at it, and has it when the level saved one there (its saved plan's payload). A choice where none is due
 * counts for nothing and its level's edit writes it away, so it's no issue.
 */
export async function checkDueChoices(characters: Character[]) {
  console.log("\n═══ Phase 3: Due Choices ═══\n");
  let issues = 0;

  for (const char of characters) {
    // A subsheet's levels are the character's it's under to plan
    if (char.parentCharacterId) continue;
    await withRulesetScope(db, char.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, char);
      const levelUp = Engine.for(scope).character(character).levelUp();
      for (const [index, level] of character.rows.advancements.entries()) {
        // Its edit's plan, answering nothing (a pick a reference check flags would refuse the saved one): a `choose`
        // step that takes a choice at the level makes one due. A level the plan can't read (what it's on gone, which
        // the reference check reports) is skipped, and logged
        let due: { label: string; name: string }[];
        let saved: Record<string, unknown>;
        let which: string;
        try {
          const answer = levelUp.describePlan({ editedLevelId: level.id, steps: {} });
          const labels = new Map(levelUp.listSteps(level.id).steps.map((step) => [step.name, step.label]));
          due = Object.entries(answer.steps)
            .filter(([, step]) => step.mechanic === "choose" && step.advancements.length > 0)
            .map(([name]) => ({ label: labels.get(name) ?? name, name }));
          saved = levelUp.describeSavedPlan(level.id).steps ?? {};
          // The level as its track names it (3.5's class and its level in it)
          const [advancement] = answer.advancements;
          which = `level ${index + 1} (${advancement?.track.name} ${advancement?.position})`;
        } catch (error) {
          console.warn(
            `    ${char.name}: level ${index + 1} skipped — ${error instanceof Error ? error.message : error}`,
          );
          continue;
        }
        for (const { label, name } of due) {
          const payload = saved[name];
          if (Array.isArray(payload) && payload.flat().length > 0) continue;
          issues++;
          console.error(`    ${char.name}: ${which} misses its ${label.toLowerCase()}`);
        }
      }
    });
  }

  console.log(issues > 0 ? `✗ due choices: ${issues} missed` : "✓ due choices");
  return issues;
}
