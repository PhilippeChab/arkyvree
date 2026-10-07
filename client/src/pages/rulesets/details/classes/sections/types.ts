import type { RulesetDetail } from "@/client/src/lib/queries.ts";

/** What the class page passes each of its tabs. */
export interface ClassSectionProps {
  classId: string;
  className: string;
  /** A delete on its tab can be undone from Local Changes: the class is inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
  rulesetId: string;
}
