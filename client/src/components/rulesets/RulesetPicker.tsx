import { Autocomplete, TextField } from "@mui/material";
import type { Ref } from "react";
import type { FieldError } from "react-hook-form";

import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";

import type { RulesetOption, RulesetPickerOptions } from "./useRulesetPickerOptions.ts";

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
