import { Autocomplete, TextField } from "@mui/material";
import { type Ref } from "react";
import type { FieldError } from "react-hook-form";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import type { Aptitude, AptitudeScope } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

import { useAptitudeOptions } from "./useAptitudeOptions.ts";

interface AptitudeAutocompleteProps {
  disabled?: boolean;
  label?: string;
  /** The picked aptitude's failure to load, said under the field. */
  loadError?: unknown;
  onChange: (aptitude: Aptitude | null) => void;
  rulesetId: string;
  scope?: AptitudeScope;
  size?: "small" | "medium";
  value: Aptitude | null;
}

interface AptitudesAutocompleteProps {
  disabled?: boolean;
  error?: FieldError;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (aptitudes: Aptitude[]) => void;
  rulesetId: string;
  scope?: AptitudeScope;
  value: Aptitude[];
}

export function AptitudeAutocomplete({
  rulesetId,
  value,
  onChange,
  disabled,
  label = "Aptitude",
  loadError,
  size,
  scope,
}: AptitudeAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Ensure selected value always appears in options
  const options =
    value && !fetchedOptions.some((opt) => opt.id === value.id) ? [value, ...fetchedOptions] : fetchedOptions;

  return (
    <Autocomplete
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      size={size}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={!!loadError}
          helperText={loadError ? loadFailureMessage(label, loadError) : undefined}
        />
      )}
    />
  );
}

export function AptitudesAutocomplete({
  rulesetId,
  value,
  onChange,
  disabled,
  scope,
  inputRef,
  error,
}: AptitudesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Merge selected values with fetched options so selected items always appear
  const selectedIds = new Set(value.map((v) => v.id));
  const options = [...value, ...fetchedOptions.filter((opt) => !selectedIds.has(opt.id))];

  return (
    <Autocomplete
      multiple
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      renderValue={(tagValue, getItemProps) =>
        tagValue.map((option, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <ValueChip color="default" key={key} label={option.name} {...chipProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} inputRef={inputRef} label="Aptitudes" error={!!error} helperText={error?.message} />
      )}
    />
  );
}
