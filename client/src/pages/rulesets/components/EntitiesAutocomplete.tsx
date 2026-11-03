import { Autocomplete, Box, TextField, Typography } from "@mui/material";
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
  /**
   * Why an entity can't be picked, if it can't (a spell already on the list it's added to): its option shows greyed,
   * the reason under its name.
   */
  unavailable?: (entity: EntityRow) => string | undefined;
  value: Pick<EntityRow, "id" | "name">[];
}

/**
 * A form's entities of a kind, any of the ruleset's (a feat's pools, a spell's lists, the spells a class's list takes):
 * read-only under `ReadOnlyFields`.
 */
export function EntitiesAutocomplete({
  error,
  inputRef,
  label,
  onChange,
  rulesetId,
  type,
  unavailable,
  value,
}: EntitiesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useEntityOptions<Pick<EntityRow, "id" | "name">>(rulesetId, type, {
    limit: 10,
    what: label,
  });
  const readOnly = useReadOnlyFields();
  // Why each fetched entity can't be picked, by its id
  const reasons = new Map(
    fetchedOptions.flatMap((option) => {
      const reason = unavailable?.(option);
      return reason ? [[option.id, reason] as const] : [];
    }),
  );

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
      getOptionDisabled={(option) => reasons.has(option.id)}
      // An entity that can't be picked says why under its name; the others read as their name alone
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;
        const reason = reasons.get(option.id);
        return (
          <Box component="li" key={key} {...optionProps}>
            {reason === undefined ? (
              option.name
            ) : (
              <Box>
                <Typography variant="body2">{option.name}</Typography>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {reason}
                </Typography>
              </Box>
            )}
          </Box>
        );
      }}
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
