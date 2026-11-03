import type { RulesetData } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The 3.5 feat rules of a ruleset's view (`rulesetData`), derived once and kept with it (`FeatRules.of`): which feats
 * stack, and which a character can take again. A feat that stacks is taken each time it's picked, a row a pick; a
 * character holds one that doesn't once. And which of a family's feats are its variants (`variantOf`).
 */
export default class FeatRules {
  constructor(private readonly rulesetData: RulesetData) {}

  /** The view's feat rules, derived once with it. */
  static of(rulesetData: RulesetData): FeatRules {
    return rulesetData.derive(FeatRules);
  }

  /**
   * The variant a feat of a family (`name`, `family`: one of its FEAT_FAMILY values) is: what its name says past the
   * family's and a colon (`Weapon Focus: Longsword`, Weapon Focus's Longsword). None when its name doesn't say the
   * family's so (Lucky Break, a luck feat; Deity's Weapon Focus: Club, which counts as a Weapon Focus): a member of the
   * family, which its requirements count, but no variant of it, which a picker lists alone.
   */
  static variantOf(name: string, family: string): string | undefined {
    const prefix = `${family}: `;
    return name.startsWith(prefix) ? name.slice(prefix.length) : undefined;
  }

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
