import { Autocomplete, type AutocompleteInputChangeReason, Chip, TextField } from "@mui/material";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type AptitudesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["aptitudes"]["$get"], 200>;
export type Aptitude = AptitudesPaginated["items"][number];

function useAptitudeOptions(rulesetId: string, scope?: "feats" | "spells") {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: fetchedOptions,
    isLoading,
    onScroll,
  } = useListboxQuery({
    queryKey: queryKeys.rulesets.sectionSearch(rulesetId, "aptitudes", debouncedSearch, scope),
    queryFn: async ({ pageParam }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].aptitudes.$get({
          param: { id: rulesetId },
          query: {
            limit: "10",
            page: pageParam.toString(),
            search: debouncedSearch || undefined,
            scope: scope || undefined,
          },
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  // The server searches and pages the list; the Autocomplete only shows it.
  const autocompleteProps = {
    getOptionLabel: (option: Aptitude) => option.name,
    isOptionEqualToValue: (option: Aptitude, val: Aptitude) => option.id === val.id,
    onInputChange: (_: unknown, inputValue: string, reason: AutocompleteInputChangeReason) => {
      if (reason === "input") setSearch(inputValue);
    },
    filterOptions: (options: Aptitude[]) => options,
    loading: isLoading,
    fullWidth: true,
    slotProps: { listbox: { component: ScrollSafeListbox, onScroll } },
  };

  return { fetchedOptions, autocompleteProps };
}

interface AptitudesAutocompleteProps {
  rulesetId: string;
  value: Aptitude[];
  onChange: (aptitudes: Aptitude[]) => void;
  disabled?: boolean;
  scope?: "feats" | "spells";
}

export function AptitudesAutocomplete({ rulesetId, value, onChange, disabled, scope }: AptitudesAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Merge selected values with fetched options so selected items always appear
  const selectedIds = new Set(value.map((v) => v.id));
  const options = [...value, ...fetchedOptions.filter((opt) => !selectedIds.has(opt.id))];

  return (
    <Autocomplete
      multiple
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      renderValue={(tagValue, getItemProps) =>
        tagValue.map((option, index) => {
          const { key, ...chipProps } = getItemProps({ index });
          return <Chip key={key} label={option.name} size="small" {...chipProps} />;
        })
      }
      renderInput={(params) => <TextField {...params} label="Aptitudes" />}
    />
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

export function AptitudeAutocomplete({
  rulesetId,
  value,
  onChange,
  disabled,
  label = "Aptitude",
  size,
  scope,
}: AptitudeAutocompleteProps) {
  const { fetchedOptions, autocompleteProps } = useAptitudeOptions(rulesetId, scope);

  // Ensure selected value always appears in options
  const options =
    value && !fetchedOptions.some((opt) => opt.id === value.id) ? [value, ...fetchedOptions] : fetchedOptions;

  return (
    <Autocomplete
      options={options}
      {...autocompleteProps}
      value={value}
      onChange={(_, newValue) => onChange(newValue)}
      disabled={disabled}
      size={size}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}
