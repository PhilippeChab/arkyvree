import { ToggleButton } from "@mui/material";
import type { ReactNode } from "react";

import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionProps.ts";

type SectionActionsProps = RulesetSectionProps & {
  /** The section's own toggles, shown before "Local Changes". */
  children?: ReactNode;
};

/** The toggles of a ruleset section's toolbar: the section's own, then "Local Changes" where its changes are viewed. */
export function SectionActions({ ruleset, childOnly, onChildOnlyChange, children }: SectionActionsProps) {
  const { canViewChanges } = useRulesetPermissions(ruleset);
  return (
    <>
      {children}
      {canViewChanges && (
        <ToggleButton
          value="childOnly"
          selected={childOnly}
          onChange={() => onChildOnlyChange(!childOnly)}
          sx={{ textTransform: "none" }}
        >
          Local Changes
        </ToggleButton>
      )}
    </>
  );
}
