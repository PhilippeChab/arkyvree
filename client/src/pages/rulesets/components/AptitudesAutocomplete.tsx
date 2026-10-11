import { Autocomplete, TextField } from "@mui/material";
import { type Ref } from "react";
import type { FieldError } from "react-hook-form";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import type { AptitudeScope } from "@/client/src/pages/rulesets/optionQueries.ts";

import { useAptitudeOptions } from "./useAptitudeOptions.ts";

interface AptitudeAutocompleteProps {
  /** The picked aptitude's failure to load, said under the field. */
  loadError?: unknown;
  onChange: (aptitude: Aptitude | null) => void;
  rulesetId: string;
  /** The aptitudes its list filters by: the feats' or the spells'. */
  scope: AptitudeScope;
  value: Aptitude | null;
}

interface AptitudesAutocompleteProps {
  error?: FieldError;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  onChange: (aptitudes: Aptitude[]) => void;
  rulesetId: string;
  value: Aptitude[];
}

/** A list's aptitude filter, in its toolbar: one aptitude, or none. */
export function AptitudeAutocomplete({ rulesetId, value, onChange, loadError, scope }: AptitudeAutocompleteProps) {
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
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          label="Aptitude"
          error={!!loadError}
          helperText={loadError ? loadFailureMessage("Aptitude", loadError) : undefined}
        />
      )}
    />
  );
}

/** A form's aptitudes, any of the ruleset's (a feat's, a spell's lists). */
export function AptitudesAutocomplete({ rulesetId, value, onChange, inputRef, error }: AptitudesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId);

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
