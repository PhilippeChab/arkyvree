import { Autocomplete, TextField } from "@mui/material";
import type { Ref, UIEventHandler } from "react";
import type { FieldError } from "react-hook-form";

import { AnimatedAlert, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";

interface BaseRulesetAlertProps {
  ruleset: PickableRuleset | null;
}

interface PickableRuleset {
  /** The heading it's listed under ("My Drafts", "Published"…). */
  group: string;
  id: string;
  name: string;
  /** Null for a base ruleset. */
  userId: string | null;
}

interface RulesetPickerProps<R extends PickableRuleset> {
  disabled?: boolean;
  error?: FieldError;
  /** The Controller's `field.ref`, so a failed submit focuses the input. */
  inputRef?: Ref<HTMLInputElement>;
  /** Why the rulesets didn't load, said where they'd show. */
  loadError?: unknown;
  loading?: boolean;
  onChange: (ruleset: R | null) => void;
  /** Loads the next page as the list nears its end (see `createListboxScrollHandler`). */
  onScroll: UIEventHandler<HTMLElement>;
  /** The typed search; the list is filtered on the server. */
  onSearch: (search: string) => void;
  rulesets: R[];
  value: R | null;
}

/**
 * The warning shown once a base ruleset is picked: it can't be edited until forked. Its dialog's column spaces it, which
 * would space it even closed: it's mounted only while it shows.
 */
export function BaseRulesetAlert({ ruleset }: BaseRulesetAlertProps) {
  if (ruleset === null || ruleset.userId) return null;
  return (
    <AnimatedAlert in severity="warning">
      Base rulesets are read-only templates. Fork it first to customize rules for your group.
    </AnimatedAlert>
  );
}

/** A create dialog's ruleset field, with the rulesets under their group headings. */
export function RulesetPicker<R extends PickableRuleset>({
  rulesets,
  value,
  onChange,
  onSearch,
  onScroll,
  loading,
  loadError,
  disabled,
  error,
  inputRef,
}: RulesetPickerProps<R>) {
  return (
    <Autocomplete
      options={rulesets}
      getOptionLabel={(option) => option.name}
      groupBy={(option) => option.group}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={value}
      onChange={(_, ruleset) => onChange(ruleset)}
      onInputChange={(_, search, reason) => {
        if (reason === "input") onSearch(search);
      }}
      filterOptions={(options) => options}
      loading={loading}
      noOptionsText={emptyOptionsText("Rulesets", loadError)}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} inputRef={inputRef} label="Ruleset" error={!!error} helperText={error?.message} />
      )}
      fullWidth
      slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
    />
  );
}
