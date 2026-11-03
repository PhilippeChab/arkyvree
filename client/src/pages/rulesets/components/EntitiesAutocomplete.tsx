import { Autocomplete, TextField } from "@mui/material";
import { type Ref } from "react";
import type { FieldError } from "react-hook-form";

import { EMPTY_VALUE_TEXT, useReadOnlyFields, ValueChip } from "@/client/src/components/common/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";

import { useEntityOptions } from "./useEntityOptions.ts";

interface EntitiesAutocompleteProps {
  error?: FieldError;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  /** What it's labeled, its field's label, which its failure to load names */
  label: string;
  onChange: (entities: Pick<EntityRow, "id" | "name">[]) => void;
  rulesetId: string;
  /** The kind its entities are of (a feat's pools' kind) */
  type: string;
  value: Pick<EntityRow, "id" | "name">[];
}

/** A form's entities of a kind, any of the ruleset's (a feat's pools, a spell's lists): read-only under `ReadOnlyFields`. */
export function EntitiesAutocomplete({
  error,
  inputRef,
  label,
  onChange,
  rulesetId,
  type,
  value,
}: EntitiesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useEntityOptions<Pick<EntityRow, "id" | "name">>(rulesetId, type, {
    limit: 10,
    what: label,
  });
  const readOnly = useReadOnlyFields();

  // Merge selected values with fetched options so selected items always appear
  const selectedIds = new Set(value.map((v) => v.id));
  const options = [...value, ...fetchedOptions.filter((opt) => !selectedIds.has(opt.id))];

  return (
    <Autocomplete
      multiple
      readOnly={readOnly}
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
        <TextField
          {...params}
          inputRef={inputRef}
          label={label}
          error={!!error}
          helperText={error?.message}
          // Read-only, "—" for none
          placeholder={(readOnly && value.length === 0 && EMPTY_VALUE_TEXT) || undefined}
          slotProps={readOnly ? { ...params.slotProps, inputLabel: { shrink: true } } : params.slotProps}
        />
      )}
    />
  );
}
