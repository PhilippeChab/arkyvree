/** The races a new character can pick. */

import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";

/**
 * The race picker of a new character of what its form says (`identity`: its alignment and gender, when given): what it
 * offers (`filters`, which the server reads a page of races with: a player character's), and each race of a page
 * described (`describe`), with whether the character meets its requirements. A requirement on what the form doesn't say
 * counts as met.
 */
export default class RacePicker {
  constructor(
    private readonly view: RulesetView,
    identity: { alignment?: string; gender?: string },
  ) {
    // Only what the form says: a requirement on what it doesn't reads no value, which leaves it invalid, not unmet
    const identityData: Record<string, Record<string, unknown>> = {
      physiology: {},
      beliefs: {},
      background: {},
      meta: {},
    };
    if (identity.alignment) identityData.beliefs.alignment = identity.alignment;
    if (identity.gender) identityData.physiology.gender = identity.gender;
    this.components = { identity: { getIdentity: () => identityData } };
  }

  /** The new character, as its form says it: its identity alone. */
  private readonly components: Components;

  /** The paths the races' requirements target. */
  private readonly targetPaths = new Dnd35TargetPaths();

  /** What the picker offers: a player character's races. */
  readonly filters = { kind: "pc" };

  /** The races of a page, each with whether the new character meets its requirements. */
  describe<T extends { id: string }>(races: T[]): (T & { eligible: boolean })[] {
    return this.view.rulesetData.cow.resolveRows(races).map((race) => {
      const requirements = this.view.rulesetData.requirementsByEntity.get(race.id);
      if (!requirements || requirements.length === 0) return { ...race, eligible: true };
      const evaluator = new RequirementEvaluator(this.targetPaths);
      evaluator.evaluateRequirements(this.components, [requirements]);
      return { ...race, eligible: evaluator.getRequirements().unmetRequirementGroups.length === 0 };
    });
  }
}
