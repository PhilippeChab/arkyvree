import { Autocomplete, Chip, ListItem, ListItemText, Stack, TextField } from "@mui/material";
import {
  type DefaultError,
  type InfiniteData,
  keepPreviousData,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { useMemo } from "react";

import { DiceSpinner, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";

/** A suggestion of the customization completion endpoints. */
interface Completion {
  value: string;
  label: string;
  /** Where it comes from: the engine's own or the ruleset's. */
  kind: string;
  detail?: string | null;
}

interface CompletionAutocompleteProps<
  TPage extends CompletionPage,
  TKey extends QueryKey,
  TData extends InfiniteData<TPage, unknown>,
> {
  value: string;
  onChange: (value: string) => void;
  /** The completions for what's typed, a page at a time: a factory of `customizationQueries.ts`. */
  query: (search: string) => UseInfiniteQueryOptions<TPage, DefaultError, TData, TKey, number>;
  enabled: boolean;
  label: string;
  placeholder: string;
  loadingText: string;
  noOptionsText: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  multiline?: boolean;
  rows?: number;
}

/** A page of the customization completion endpoints. */
interface CompletionPage {
  items: Completion[];
  nextPage?: number | null;
}

/** A free-text field that suggests the values the ruleset already uses. */
export function CompletionAutocomplete<
  TPage extends CompletionPage,
  TKey extends QueryKey,
  TData extends InfiniteData<TPage, unknown>,
>({
  value,
  onChange,
  query,
  enabled,
  label,
  placeholder,
  loadingText,
  noOptionsText,
  required = false,
  error = false,
  helperText,
  disabled = false,
  fullWidth = true,
  multiline = false,
  rows,
}: CompletionAutocompleteProps<TPage, TKey, TData>) {
  // Controlled: what's typed is the value, which every keystroke and pick reports
  const debouncedInputValue = useDebouncedValue(value);

  const { items, isLoading, onScroll } = useListboxQuery({
    ...query(debouncedInputValue),
    enabled: enabled && !disabled,
    placeholderData: keepPreviousData,
  });

  // The same value can come from the engine and the ruleset; list it once.
  const completions = useMemo(() => {
    const seen = new Set<string>();
    return items.filter((completion) => {
      if (seen.has(completion.value)) return false;
      seen.add(completion.value);
      return true;
    });
  }, [items]);

  return (
    <Autocomplete
      value={value}
      inputValue={value}
      onInputChange={(_, newValue) => onChange(newValue)}
      onChange={(_, newValue) => {
        if (newValue === null) return;
        onChange(typeof newValue === "string" ? newValue : newValue.value);
      }}
      options={completions}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.label)}
      renderOption={({ key, ...props }, option) => (
        <ListItem key={key} {...props}>
          {typeof option === "string" ? (
            option
          ) : (
            <ListItemText
              primary={
                <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  {option.label}
                  <Chip
                    label={option.kind}
                    size="small"
                    variant="outlined"
                    color={option.kind === "engine" ? "primary" : "default"}
                  />
                </Stack>
              }
              secondary={option.detail}
            />
          )}
        </ListItem>
      )}
      freeSolo
      fullWidth={fullWidth}
      disabled={disabled}
      loading={isLoading}
      loadingText={loadingText}
      noOptionsText={noOptionsText}
      filterOptions={(options) => options}
      slotProps={{
        listbox: {
          component: ScrollSafeListbox,
          onScroll,
        },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={placeholder}
          multiline={multiline}
          rows={rows}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {isLoading && <DiceSpinner size="small" />}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
