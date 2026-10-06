import { Autocomplete, TextField } from "@mui/material";
import type { Ref, UIEventHandler } from "react";
import type { FieldError } from "react-hook-form";

import { AnimatedAlert } from "./AnimatedAlert.tsx";
import { ScrollSafeListbox } from "./ScrollSafeListbox.tsx";

interface BaseRulesetAlertProps {
  ruleset: PickableRuleset | null;
}

interface PickableRuleset {
  id: string;
  name: string;
  /** Null for a base ruleset. */
  userId: string | null;
  /** The heading it's listed under ("My Drafts", "Published"…). */
  group: string;
}

interface RulesetPickerProps<R extends PickableRuleset> {
  rulesets: R[];
  value: R | null;
  onChange: (ruleset: R | null) => void;
  /** The typed search; the list is filtered on the server. */
  onSearch: (search: string) => void;
  /** Loads the next page as the list nears its end (see `createListboxScrollHandler`). */
  onScroll: UIEventHandler<HTMLElement>;
  loading?: boolean;
  disabled?: boolean;
  error?: FieldError;
  /** The Controller's `field.ref`, so a failed submit focuses the input. */
  inputRef?: Ref<HTMLInputElement>;
}

/** The warning shown once a base ruleset is picked: it can't be edited until forked. */
export function BaseRulesetAlert({ ruleset }: BaseRulesetAlertProps) {
  return (
    <AnimatedAlert in={ruleset !== null && !ruleset.userId} severity="warning">
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
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} inputRef={inputRef} label="Ruleset" error={!!error} helperText={error?.message} />
      )}
      fullWidth
      slotProps={{ listbox: { component: ScrollSafeListbox, onScroll } }}
    />
  );
}
