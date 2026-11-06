import type { CreationPickQuery, EntityRecord } from "@/engine/core/module/index.ts";
import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import { Picker } from "@/engine/core/pickers/index.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd52TargetPaths from "@/engine/rulesets/dnd5.2/Dnd52TargetPaths.ts";
import type { Requirement } from "@/shared/relations.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * A new character's creation pick's picker (its species', its background's), of what its form says (`identity`: its
 * form's alignment and gender, by the stored fields that keep them, when given): each option checked against the form.
 * A requirement on what the form doesn't say counts as met, and the form says no tree of what an option fails: there's
 * no character yet to word it for. What it offers is its kind's (`filters`).
 */
export default abstract class CreationPicker extends Picker<EntityRecord> {
  constructor(view: RulesetView, identity: CreationPickQuery) {
    super(view);
    // Only what the form says: a requirement on what it doesn't reads no value, which leaves it invalid, not unmet
    const identityData: Record<string, Record<string, unknown>> = {
      physiology: {},
      beliefs: {},
      background: {},
      meta: {},
    };
    const { [CHARACTER_ALIGNMENT]: alignment, [CHARACTER_GENDER]: gender } = identity;
    if (alignment) identityData.beliefs.alignment = alignment;
    if (gender) identityData.physiology.gender = gender;
    this.components = { identity: { getIdentity: () => identityData } };
  }

  /** The new character, as its form says it: its identity alone. */
  private readonly components: Components;

  /** The paths its options' requirements target. */
  private readonly targetPaths = new Dnd52TargetPaths();

  /** No tree: the form has no character to word it for. */
  protected override describeFailed() {
    return undefined;
  }

  /** Whether the form meets a species's requirement groups: what it doesn't say counts as met. */
  protected override meets(groups: Requirement[][]) {
    const evaluator = new RequirementEvaluator(this.targetPaths);
    evaluator.evaluateRequirements(this.components, groups);
    return evaluator.getRequirements().unmetRequirementGroups.length === 0;
  }
}
