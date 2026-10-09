/** The races a new character can pick. */

import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";

/** The race picker of a new character: the races it offers, and whether each is eligible. */
export default class RacePicker {
  /**
   * The race picker for a new character of what its form says (`identity`: its alignment and gender, when given): what
   * it offers (`filters`, which the server reads a page of races with: a player character's), and each race of a page
   * (`annotate`), with whether the character meets its requirements. A requirement on what the form doesn't say counts
   * as met.
   */
  static open(view: RulesetView, identity: { alignment?: string; gender?: string }) {
    // Only what the form says: a requirement on what it doesn't reads no value, which leaves it invalid, not unmet
    const identityData: Record<string, Record<string, unknown>> = {
      physiology: {},
      beliefs: {},
      background: {},
      meta: {},
    };
    if (identity.alignment) identityData.beliefs.alignment = identity.alignment;
    if (identity.gender) identityData.physiology.gender = identity.gender;
    const components: Components = { identity: { getIdentity: () => identityData } };
    const targetPaths = new Dnd35TargetPaths();
    return {
      filters: { kind: "pc" },
      annotate<T extends { id: string }>(races: T[]): (T & { eligible: boolean })[] {
        return view.rulesetData.cow.resolveRows(races).map((race) => {
          const requirements = view.rulesetData.requirementsByEntity.get(race.id);
          if (!requirements || requirements.length === 0) return { ...race, eligible: true };
          const evaluator = new RequirementEvaluator(targetPaths);
          evaluator.evaluateRequirements(components, [requirements]);
          return { ...race, eligible: evaluator.getRequirements().unmetRequirementGroups.length === 0 };
        });
      },
    };
  }
}
