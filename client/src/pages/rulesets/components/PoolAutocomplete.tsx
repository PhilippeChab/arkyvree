import { Autocomplete, TextField } from "@mui/material";

import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import type { EntityKindDescription, RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";

import { useEntityOptions } from "./useEntityOptions.ts";

interface PoolAutocompleteProps {
  /** The picked pool's failure to load, said under the field. */
  loadError?: unknown;
  onChange: (pool: EntityRow | null) => void;
  /** The pools its list narrows by: their kind, and those its entities are picked in (the feats' or the spells'). */
  pools: NonNullable<EntityKindDescription["pools"]>;
  rulesetId: string;
  value: EntityRow | null;
  /** Its rules' words, which name its pools' kind ("Aptitude"). */
  words: RulesWords | undefined;
}

/** A list's pool filter, in its toolbar: one pool, or none. */
export function PoolAutocomplete({ rulesetId, value, onChange, loadError, pools, words }: PoolAutocompleteProps) {
  const one = entityTypeLabel(pools.type, words);
  const { fetchedOptions, autocompleteProps } = useEntityOptions(rulesetId, pools.type, {
    limit: 10,
    scope: pools.scope,
    what: entityTypeLabel(pools.type, words, true),
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
          label={one}
          error={!!loadError}
          helperText={loadError ? loadFailureMessage(one, loadError) : undefined}
        />
      )}
    />
  );
}
