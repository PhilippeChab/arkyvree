import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/**
 * Whether deleting what a ruleset shows can be undone: in a fork or an extension, an entity it inherits (one its parent
 * or an extension holds, `holderRulesetId`) leaves a change its Local Changes revert, which brings the entity back
 * with what it holds (a modifier, a property, a class's level). The ruleset's own entity, its copy of an inherited one
 * too, is gone for good, as is everything of a ruleset without a parent.
 */
export function isRestorableDelete(
  ruleset: Pick<RulesetDetail, "id" | "rulesetId"> | undefined,
  holderRulesetId: string | undefined,
) {
  return !!ruleset?.rulesetId && !!holderRulesetId && holderRulesetId !== ruleset.id;
}
