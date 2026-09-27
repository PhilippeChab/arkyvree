import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  rulesetId: string;
  classId: string;
  className: string;
  ruleset: RulesetDetail;
}
