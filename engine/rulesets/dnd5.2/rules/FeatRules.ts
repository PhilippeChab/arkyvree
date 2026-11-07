import type { RulesetData } from "@/engine/core/view/index.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { FEATS_TAKEN_ONCE } from "@/vocabulary/dnd5.2/feats.ts";
import { FEAT_FAMILY, FEAT_STACKABLE } from "@/vocabulary/dnd5.2/fields/index.ts";

/**
 * The D&D 5th Edition feat rules of a ruleset's view (`rulesetData`), derived once and kept with it (`FeatRules.of`):
 * which feats stack, and which a character can take again. A feat that stacks is taken each time it's picked, a row a
 * pick; a character holds one that doesn't once, and one version of a feat taken once (`FEATS_TAKEN_ONCE`). And which
 * of a family's feats are its variants (`variantOf`).
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

  /** A feat's families (FEAT_FAMILY), by its id: none for one of no family. */
  private familiesOf(featId: string): readonly string[] {
    const families = Dnd52View.of(this.rulesetData).featsById.get(featId)?.fields[FEAT_FAMILY];
    return Array.isArray(families) ? families : [];
  }

  /**
   * Whether a character can take the feat (`featId`) with those it holds already (`heldIds`): one that stacks each
   * time, one that doesn't when it holds it not, and a version of a feat taken once (`FEATS_TAKEN_ONCE`) when it holds
   * no other version (Grappler (Dexterity) refused beside Grappler (Strength)), whatever the versions are named.
   */
  canTake(featId: string, heldIds: ReadonlySet<string>): boolean {
    if (heldIds.has(featId)) return this.isStackable(featId);
    const once: readonly string[] = this.familiesOf(featId).filter((family) => isOneOf(family, FEATS_TAKEN_ONCE));
    if (once.length === 0) return true;
    return ![...heldIds].some((heldId) => this.familiesOf(heldId).some((family) => once.includes(family)));
  }

  /** Whether the ruleset's feat (`featId`) stacks: a character may have it more than once. */
  isStackable(featId: string): boolean {
    return Dnd52View.of(this.rulesetData).featsById.get(featId)?.fields[FEAT_STACKABLE] === true;
  }
}
