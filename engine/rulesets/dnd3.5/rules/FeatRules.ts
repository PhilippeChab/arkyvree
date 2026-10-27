import type { RulesetData } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The 3.5 feat rules of a ruleset's view (`rulesetData`): which feats stack, and which a character can take again. A
 * feat that stacks is taken each time it's picked, a row a pick; a character holds one that doesn't once.
 */
export default class FeatRules {
  constructor(private readonly rulesetData: RulesetData) {}

  /**
   * Whether a character can take the feat (`featId`) with those it holds already (`heldIds`): one that stacks each
   * time, one that doesn't when it holds it not.
   */
  canTake(featId: string, heldIds: ReadonlySet<string>): boolean {
    return !heldIds.has(featId) || this.isStackable(featId);
  }

  /** Whether the ruleset's feat (`featId`) stacks: a character may have it more than once. */
  isStackable(featId: string): boolean {
    return Dnd35View.of(this.rulesetData).featsById.get(featId)?.fields[FEAT_STACKABLE] === true;
  }
}
