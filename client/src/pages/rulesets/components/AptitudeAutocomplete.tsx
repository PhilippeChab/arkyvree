import { Autocomplete, TextField } from "@mui/material";

import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import type { Aptitude } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

import { useEntityOptions } from "./useEntityOptions.ts";

interface AptitudeAutocompleteProps {
  /** The picked aptitude's failure to load, said under the field. */
  loadError?: unknown;
  onChange: (aptitude: Aptitude | null) => void;
  rulesetId: string;
  /** The aptitudes its list filters by: the feats' or the spells'. */
  scope: string;
  value: Aptitude | null;
}

/** A list's aptitude filter, in its toolbar: one aptitude, or none. */
export function AptitudeAutocomplete({ rulesetId, value, onChange, loadError, scope }: AptitudeAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useEntityOptions(rulesetId, "aptitudes", {
    limit: 10,
    scope,
    what: "Aptitudes",
  });

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
