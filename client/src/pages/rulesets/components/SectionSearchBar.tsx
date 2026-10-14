import type { ReactNode } from "react";

import { SearchBar, type SearchBarProps } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";

import { SectionActions } from "./SectionActions.tsx";

type SectionSearchBarProps<TFilter extends string, TSort extends string> = RulesetSectionProps &
  Omit<SearchBarProps<TFilter, TSort>, "actions" | "addLabel" | "onAdd"> & {
    /** The section's own toggles ("Group Families"), shown before "Local Changes". */
    children?: ReactNode;
  } &
  /** The add button ("Add Race"), shown to users who can edit the ruleset's entities. */
  ({ addLabel: string; onAdd: () => void } | { addLabel?: never; onAdd?: never });

/**
 * A ruleset section's toolbar: its `SearchBar`, its toggles and "Local Changes" on forks (`SectionActions`), and its
 * add for who can edit the ruleset's entities. Local Changes on narrows the list, which a phone's filters button says.
 */
export function SectionSearchBar<TFilter extends string = string, TSort extends string = string>({
  ruleset,
  childOnly,
  onChildOnlyChange,
  addLabel,
  onAdd,
  children,
  filtered = false,
  ...searchBarProps
}: SectionSearchBarProps<TFilter, TSort>) {
  const { canEditEntities } = useRulesetPermissions(ruleset);

  return (
    <SearchBar
      {...searchBarProps}
      filtered={filtered || (!!ruleset.rulesetId && childOnly)}
      actions={
        <SectionActions ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={onChildOnlyChange}>
          {children}
        </SectionActions>
      }
      addLabel={addLabel}
      onAdd={canEditEntities ? onAdd : undefined}
    />
  );
}
