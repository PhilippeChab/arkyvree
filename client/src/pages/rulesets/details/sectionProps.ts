import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/** What the ruleset page passes every section tab. */
export interface RulesetSectionProps {
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
  ruleset: RulesetDetail;
}
