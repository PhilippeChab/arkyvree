import { DiceSpinner, ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Autocomplete, Chip, ListItem, TextField } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useEffect, useMemo, useState } from "react";

type CompletionsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"]["properties"]["values"]["completions"]["$get"]
>;
type CompletionsPage = Exclude<CompletionsResponse, { error: string }>;
type PropertyValueCompletion = CompletionsPage["items"][number];

interface PropertyValueInputProps {
  value: string;
  onChange: (value: string) => void;
  rulesetId: string;
  propertyType: string;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}

export function PropertyValueInput({
  value,
  onChange,
  rulesetId,
  propertyType,
  label = "Value",
  required = false,
  error = false,
  helperText,
  disabled = false,
  fullWidth = true,
  placeholder = "Enter the property value...",
  multiline = false,
  rows,
}: PropertyValueInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const debouncedInputValue = useDebouncedValue(inputValue);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["propertyValueCompletions", rulesetId, propertyType, debouncedInputValue],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].customization.properties.values.completions
        .$get({
          param: { id: rulesetId },
          query: {
            type: propertyType,
            query: debouncedInputValue || "",
            limit: "10",
            page: pageParam.toString(),
          },
        });
      if (!response.ok) throw new Error("Failed to fetch property value completions");
      return response.json();
    },
    enabled: !!rulesetId && !!propertyType && !disabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 5000,
    placeholderData: keepPreviousData,
  });

  const completions = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  );

  const handleInputChange = useCallback((_: unknown, newValue: string) => {
    setInputValue(newValue);
    onChange(newValue);
  }, [onChange]);

  const handleSelectionChange = useCallback(
    (_: unknown, newValue: PropertyValueCompletion | string | null) => {
      if (typeof newValue === "string") {
        onChange(newValue);
        setInputValue(newValue);
      } else if (newValue) {
        onChange(newValue.value);
        setInputValue(newValue.value);
      }
    },
    [onChange],
  );

  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      (target as unknown as Record<string, () => void>).__lockScroll?.();
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const processedCompletions = useMemo(() => {
    const seen = new Set<string>();
    return completions.filter((completion) => {
      if (seen.has(completion.value)) return false;
      seen.add(completion.value);
      return true;
    });
  }, [completions]);

  if (!propertyType) {
    return (
      <TextField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        fullWidth={fullWidth}
        placeholder={placeholder}
        multiline={multiline}
        rows={rows}
      />
    );
  }

  return (
    <Autocomplete
      value={value}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={handleSelectionChange}
      options={processedCompletions}
      getOptionLabel={(option) => {
        if (typeof option === "string") return option;
        return option.label;
      }}
      renderOption={(props, option) => {
        if (typeof option === "string") {
          const { key, ...otherProps } = props;
          return <ListItem key={key} {...otherProps}>{option}</ListItem>;
        }

        const { key, ...otherProps } = props;
        return (
          <ListItem key={key} {...otherProps}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {option.label}
              <Chip
                label={option.kind}
                size="small"
                variant="outlined"
                color={option.kind === "engine" ? "primary" : "default"}
              />
            </div>
          </ListItem>
        );
      }}
      freeSolo
      fullWidth={fullWidth}
      disabled={disabled}
      loading={isLoading}
      loadingText="Loading values..."
      noOptionsText="No values found"
      filterOptions={(options) => options}
      slotProps={{
        listbox: {
          component: ScrollSafeListbox,
          ...{
            onScroll: handleScroll,
            style: { maxHeight: 300 },
          },
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
