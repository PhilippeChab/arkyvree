import { Autocomplete, ListItem, ListItemText, Stack, TextField } from "@mui/material";
import {
  type DefaultError,
  type InfiniteData,
  keepPreviousData,
  type QueryKey,
  type UseInfiniteQueryOptions,
} from "@tanstack/react-query";
import { type Ref, useMemo } from "react";

import { ScrollSafeListbox, ValueChip } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import type { ListPage } from "@/client/src/lib/pageItems.ts";
import type { PropertyTypeCompletion, PropertyValueCompletion } from "@/shared/customization/properties.ts";

/** A page of the property completion endpoints. */
interface CompletionPage extends ListPage {
  items: Completion[];
}

interface PropertyCompletionAutocompleteProps<
  TPage extends CompletionPage,
  TKey extends QueryKey,
  TData extends InfiniteData<TPage, unknown>,
> {
  error?: boolean;
  helperText?: string;
  /** Its form field's `ref`, so a failed submit focuses it. */
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  loadingText: string;
  noOptionsText: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** The completions for what's typed, a page at a time: a factory of `customizationQueries.ts`. */
  query: (search: string) => UseInfiniteQueryOptions<TPage, DefaultError, TData, TKey, number>;
  required?: boolean;
  value: string;
}

/** A suggestion of the property completion endpoints: a type's, which has its detail, or a value's. */
type Completion = PropertyTypeCompletion | PropertyValueCompletion;

/** A property's type or value, typed freely: it suggests those the ruleset already uses. */
export function PropertyCompletionAutocomplete<
  TPage extends CompletionPage,
  TKey extends QueryKey,
  TData extends InfiniteData<TPage, unknown>,
>({
  value,
  onChange,
  query,
  inputRef,
  label,
  placeholder,
  loadingText,
  noOptionsText,
  required = false,
  error = false,
  helperText,
}: PropertyCompletionAutocompleteProps<TPage, TKey, TData>) {
  // Controlled: what's typed is the value, which every keystroke and pick reports
  const debouncedInputValue = useDebouncedValue(value);

  const {
    items,
    isLoading,
    error: loadError,
    onScroll,
  } = useListboxQuery({
    ...query(debouncedInputValue),
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
          <ListItemText
            primary={
              <Stack component="span" direction="row" spacing={1} sx={{ alignItems: "center" }}>
                {option.label}
                <ValueChip label={option.kind} color={option.kind === "engine" ? "primary" : "default"} />
              </Stack>
            }
            secondary={"detail" in option && option.detail}
          />
        </ListItem>
      )}
      freeSolo
      fullWidth
      loading={isLoading}
      loadingText={loadingText}
      noOptionsText={emptyOptionsText("Suggestions", loadError, noOptionsText)}
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
          inputRef={inputRef}
          label={label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={placeholder}
        />
      )}
    />
  );
}
