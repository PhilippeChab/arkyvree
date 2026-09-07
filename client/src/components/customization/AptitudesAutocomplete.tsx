import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Autocomplete, Chip, TextField } from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

type AptitudesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$get"]>;
type AptitudesPaginated = Exclude<AptitudesResponse, { error: string }>;
export type Aptitude = AptitudesPaginated["items"][number];

function useAptitudeOptions(rulesetId: string, scope?: "feats" | "spells") {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKeys.rulesets.section(rulesetId, "aptitudes"), "autocomplete", debouncedSearch, scope],
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].aptitudes.$get({
        param: { id: rulesetId },
        query: {
          limit: "10",
          page: pageParam.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(scope && { scope }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch aptitudes");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const fetchedOptions = data?.pages.flatMap((page) => page.items) ?? [];

  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const bottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (bottom && hasNextPage && !isFetchingNextPage) {
      (target as unknown as Record<string, () => void>).__lockScroll?.();
      fetchNextPage();
    }
  };

  return { fetchedOptions, isLoading, search, setSearch, handleScroll };
}

interface AptitudesAutocompleteProps {
  rulesetId: string;
  value: Aptitude[];
  onChange: (aptitudes: Aptitude[]) => void;
  disabled?: boolean;
  scope?: "feats" | "spells";
}

export function AptitudesAutocomplete({ rulesetId, value, onChange, disabled, scope }: AptitudesAutocompleteProps) {
  const { fetchedOptions, isLoading, setSearch, handleScroll } = useAptitudeOptions(rulesetId, scope);

  // Merge selected values with fetched options so selected items always appear
  const selectedIds = new Set(value.map((v) => v.id));
  const options = [
    ...value,
    ...fetchedOptions.filter((opt) => !selectedIds.has(opt.id)),
  ];

  return (
    <Autocomplete
      multiple
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
      renderValue={(tagValue, getItemProps) =>
        tagValue.map((option, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <Chip key={key} label={option.name} size="small" {...chipProps} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} label="Aptitudes" />
      )}
      fullWidth
      slotProps={{
        listbox: {
          component: ScrollSafeListbox,

          ...{
            onScroll: handleScroll,
            style: { maxHeight: 300 },
          }
        }
      }} />
  );
}

interface AptitudeAutocompleteProps {
  rulesetId: string;
  value: Aptitude | null;
  onChange: (aptitude: Aptitude | null) => void;
  disabled?: boolean;
  label?: string;
  size?: "small" | "medium";
  scope?: "feats" | "spells";
}

export function AptitudeAutocomplete({ rulesetId, value, onChange, disabled, label = "Aptitude", size, scope }: AptitudeAutocompleteProps) {
  const { fetchedOptions, isLoading, setSearch, handleScroll } = useAptitudeOptions(rulesetId, scope);

  // Ensure selected value always appears in options
  const options = value && !fetchedOptions.some((opt) => opt.id === value.id)
    ? [value, ...fetchedOptions]
    : fetchedOptions;

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
      size={size}
      renderInput={(params) => (
        <TextField {...params} label={label} />
      )}
      fullWidth
      slotProps={{
        listbox: {
          component: ScrollSafeListbox,

          ...{
            onScroll: handleScroll,
            style: { maxHeight: 300 },
          }
        }
      }} />
  );
}
