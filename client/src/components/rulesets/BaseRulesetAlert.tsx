import { AnimatedAlert } from "@/client/src/components/common/index.ts";

import type { RulesetOption } from "./useRulesetPickerOptions.ts";

interface BaseRulesetAlertProps {
  ruleset: RulesetOption | null;
}

/**
 * The warning shown once a base ruleset is picked: it can't be edited until forked. Its dialog's column spaces it, which
 * would space it even closed: it's mounted only while it shows.
 */
export function BaseRulesetAlert({ ruleset }: BaseRulesetAlertProps) {
  if (ruleset === null || !ruleset.system) return null;
  return (
    <AnimatedAlert in severity="warning">
      Base rulesets are read-only templates. Fork it first to customize rules for your group.
    </AnimatedAlert>
  );
}
