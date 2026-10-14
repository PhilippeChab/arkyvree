import { ToggleButton } from "@mui/material";
import type { ReactNode } from "react";

import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";

type SectionActionsProps = RulesetSectionProps & {
  /** The section's own toggles, shown before "Local Changes". */
  children?: ReactNode;
};

/** The toggles of a ruleset section's toolbar: the section's own, then "Local Changes" on forks. */
export function SectionActions({ ruleset, childOnly, onChildOnlyChange, children }: SectionActionsProps) {
  return (
    <>
      {children}
      {!!ruleset.rulesetId && (
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
