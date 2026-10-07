import { ToggleButton } from "@mui/material";
import type { ReactNode } from "react";

import { AddButton } from "@/client/src/components/common/index.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

type SectionActionsProps = RulesetSectionProps & {
  /** The section's own toggles, shown before "Local changes". */
  children?: ReactNode;
} &
  /** The add button ("Add Race"), shown to users who can edit the ruleset's entities. */
  ({ addLabel: string; onAdd: () => void } | { addLabel?: never; onAdd?: never });

/** The actions of a ruleset section's toolbar: "Local changes" on forks, and the add button. */
export function SectionActions({
  ruleset,
  childOnly,
  onChildOnlyChange,
  addLabel,
  onAdd,
  children,
}: SectionActionsProps) {
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
      {canEditEntities && onAdd && <AddButton label={addLabel} onClick={onAdd} />}
    </>
  );
}
