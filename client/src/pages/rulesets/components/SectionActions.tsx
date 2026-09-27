import { Add as AddIcon } from "@mui/icons-material";
import { Button, ToggleButton } from "@mui/material";
import type { ReactNode } from "react";

import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

interface SectionActionsProps extends RulesetSectionProps {
  /** The add button's label ("Add Race"). */
  addLabel?: string;
  /** Shows the add button to users who can edit the ruleset's entities. */
  onAdd?: () => void;
  /** The section's own toggles, shown before "Local changes". */
  children?: ReactNode;
}

/** The actions of a ruleset section's toolbar: "Local changes" on forks, and the add button. */
export function SectionActions({ ruleset, childOnly, onChildOnlyChange, addLabel, onAdd, children }: SectionActionsProps) {
  const { canEditEntities } = useRulesetPermissions(ruleset);

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
          Local changes
        </ToggleButton>
      )}
      {canEditEntities && onAdd && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
          {addLabel}
        </Button>
      )}
    </>
  );
}
