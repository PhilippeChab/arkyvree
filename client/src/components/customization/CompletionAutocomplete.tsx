import { Autocomplete, Box, Chip, ListItem, ListItemText, TextField } from "@mui/material";
import { keepPreviousData, type QueryKey } from "@tanstack/react-query";
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

interface CompletionAutocompleteProps<T extends Completion> {
  value: string;
  onChange: (value: string) => void;
  /** The completions for what's typed, a page at a time. */
  queryKey: (search: string) => QueryKey;
  pageFn: (search: string, page: number) => Promise<{ items: T[]; nextPage?: number | null }>;
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

/** A free-text field that suggests the values the ruleset already uses. */
export function CompletionAutocomplete<T extends Completion>({
  value,
  onChange,
  queryKey,
  pageFn,
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
}: CompletionAutocompleteProps<T>) {
  // Controlled: what's typed is the value, which every keystroke and pick reports
  const debouncedInputValue = useDebouncedValue(value);

  const { items, isLoading, onScroll } = useListboxQuery({
    queryKey: queryKey(debouncedInputValue),
    queryFn: ({ pageParam }) => pageFn(debouncedInputValue, pageParam),
    enabled: enabled && !disabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 5000,
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
                <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {option.label}
                  <Chip
                    label={option.kind}
                    size="small"
                    variant="outlined"
                    color={option.kind === "engine" ? "primary" : "default"}
                  />
                </Box>
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
