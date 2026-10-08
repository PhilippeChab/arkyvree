import { Autocomplete, TextField } from "@mui/material";
import type { Ref } from "react";
import type { FieldError } from "react-hook-form";

import { AnimatedAlert, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";

import type { RulesetOption, RulesetPickerOptions } from "./useRulesetPickerOptions.ts";

interface BaseRulesetAlertProps {
  ruleset: RulesetOption | null;
}

interface RulesetPickerProps {
  disabled?: boolean;
  error?: FieldError;
  /** The Controller's `field.ref`, so a failed submit focuses the input. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (ruleset: RulesetOption | null) => void;
  /** What it lists, searched and paged on the server, and why it didn't load: `useRulesetPickerOptions`'. */
  options: RulesetPickerOptions;
  value: RulesetOption | null;
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
export function RulesetPicker({ options, value, onChange, disabled, error, inputRef }: RulesetPickerProps) {
  const { rulesets, onSearch, onScroll, loading, loadError } = options;
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
