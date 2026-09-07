import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Autocomplete, TextField } from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

type SavesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["saves"]["$get"]>;
type SavesPaginated = Exclude<SavesResponse, { error: string }>;
export type Save = SavesPaginated["items"][number];

interface SavesAutocompleteProps {
  rulesetId: string;
  value: Save | null;
  onChange: (save: Save | null) => void;
  disabled?: boolean;
  enabled?: boolean;
}

export function SavesAutocomplete({ rulesetId, value, onChange, disabled, enabled = true }: SavesAutocompleteProps) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(rulesetId, "saves"), "autocomplete", debouncedSearch],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].saves.$get({
        param: { id: rulesetId },
        query: {
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch saves");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled,
  });

  const fetchedOptions = data?.pages.flatMap((page) => page.items) ?? [];

  // Ensure selected value always appears in options
  const options = value && !fetchedOptions.some((opt) => opt.id === value.id)
    ? [value, ...fetchedOptions]
    : fetchedOptions;

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  return (
    <Autocomplete
      options={options}
      getOptionLabel={(option) => option.name}
      isOptionEqualToValue={(option, val) => option.id === val.id}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      onInputChange={(_, inputValue, reason) => {
        if (reason === "input") setSearch(inputValue);
      }}
      filterOptions={(x) => x}
      loading={isLoading}
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label="Saving Throw" />
      )}
      fullWidth
      slotProps={{
        listbox: {
          onScroll: handleScroll,
          style: { maxHeight: 300 },
        }
      }}
    />
  );
}
