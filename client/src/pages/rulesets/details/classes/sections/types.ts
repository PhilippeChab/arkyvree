import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  classId: string;
  className: string;
  ruleset: RulesetDetail;
  rulesetId: string;
}
