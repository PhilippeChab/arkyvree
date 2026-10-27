/** The races a new character can pick. */

import type { CreationPickQuery, EntityRecord } from "@/engine/core/module/index.ts";
import type { Components } from "@/engine/core/paths/PathTraverser.ts";
import { Picker } from "@/engine/core/pickers/index.ts";
import RequirementEvaluator from "@/engine/core/requirements/RequirementEvaluator.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import type { Requirement } from "@/shared/relations.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { CHARACTER_ALIGNMENT, CHARACTER_GENDER } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The race picker of a new character of what its form says (`identity`: its form's alignment and gender, by the
 * stored fields that keep them, when given): a player character's races (`filters`), each checked against the form. A
 * requirement on what the form doesn't say counts as met, and the form says no tree of what a race fails: there's no
 * character yet to word it for.
 */
export default class RacePicker extends Picker<EntityRecord> {
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

  /** The paths the races' requirements target. */
  private readonly targetPaths = new Dnd35TargetPaths();

  /** What the picker offers: a player character's races (their partition, `pc`). */
  override readonly filters = { partitions: [PLAYER_CHARACTER_KIND] };

  /** No tree: the form has no character to word it for. */
  protected override describeFailed() {
    return undefined;
  }

  /** Whether the form meets a race's requirement groups: what it doesn't say counts as met. */
  protected override meets(groups: Requirement[][]) {
    const evaluator = new RequirementEvaluator(this.targetPaths);
    evaluator.evaluateRequirements(this.components, groups);
    return evaluator.getRequirements().unmetRequirementGroups.length === 0;
  }
}
