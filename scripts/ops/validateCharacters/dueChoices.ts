import { Engine } from "@/engine/index.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character } from "@/shared/relations.ts";

/**
 * Phase 3: Due choices — on the advancements the ruleset gives one at (3.5's levels with an ability increase)
 * Saving an advancement checks it, but older rows, or a ruleset whose Settings since moved its choices, can miss a due
 * one, which a character's validation doesn't flag. An advancement is due one when its edit's plan has a `choose` step
 * that takes a choice at it, and has it when the advancement saved one there (its saved plan's payload). A choice where
 * none is due counts for nothing and the advancement's edit writes it away, so it's no issue.
 */
export async function checkDueChoices(characters: Character[]) {
  console.log("\n═══ Phase 3: Due Choices ═══\n");
  let issues = 0;

  for (const char of characters) {
    // A subsheet's advancements are the character's it's under to plan
    if (char.parentCharacterId) continue;
    await withRulesetScope(db, char.rulesetId, async (scope) => {
      const character = await readCharacterInput(db, char);
      const flow = Engine.for(scope).character(character).advancements();
      for (const [index, stored] of character.rows.advancements.entries()) {
        // Its edit's plan, answering nothing (a pick a reference check flags would refuse the saved one): a `choose`
        // step that takes a choice at the advancement makes one due. One the plan can't read (what it's on gone, which
        // the reference check reports) is skipped, and logged
        let due: { label: string; name: string }[];
        let payloads: Record<string, unknown>;
        let which: string;
        try {
          const answer = flow.describePlan({ editedAdvancementId: stored.id, steps: {} });
          const labels = new Map(flow.listSteps(stored.id).steps.map((step) => [step.name, step.label]));
          due = Object.entries(answer.steps)
            .filter(([, step]) => step.mechanic === "choose" && step.advancements.length > 0)
            .map(([name]) => ({ label: labels.get(name) ?? name, name }));
          payloads = flow.describeSavedPlan(stored.id).steps ?? {};
          // The advancement as its track names it (3.5's class and its level in it)
          const [advancement] = answer.advancements;
          which = `advancement ${index + 1} (${advancement?.track.name} ${advancement?.position})`;
        } catch (error) {
          console.warn(
            `    ${char.name}: advancement ${index + 1} skipped — ${error instanceof Error ? error.message : error}`,
          );
          continue;
        }
        for (const { label, name } of due) {
          const payload = payloads[name];
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
