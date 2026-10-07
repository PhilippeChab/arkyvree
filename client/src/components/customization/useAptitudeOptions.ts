import { type AutocompleteInputChangeReason } from "@mui/material";
import { useState } from "react";

import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";

import type { Aptitude } from "./AptitudesAutocomplete.tsx";
import { aptitudeOptionsQuery } from "./customizationQueries.ts";

export function useAptitudeOptions(rulesetId: string, scope?: "feats" | "spells") {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: fetchedOptions,
    isLoading,
    error,
    onScroll,
  } = useListboxQuery(aptitudeOptionsQuery(rulesetId, debouncedSearch, scope));

  // The server searches and pages the list; the Autocomplete only shows it.
  const autocompleteProps = {
    getOptionLabel: (option: Aptitude) => option.name,
    isOptionEqualToValue: (option: Aptitude, val: Aptitude) => option.id === val.id,
    onInputChange: (_: unknown, inputValue: string, reason: AutocompleteInputChangeReason) => {
      if (reason === "input") setSearch(inputValue);
    },
    filterOptions: (options: Aptitude[]) => options,
    loading: isLoading,
    noOptionsText: emptyOptionsText("Aptitudes", error),
    fullWidth: true,
    slotProps: { listbox: { component: ScrollSafeListbox, onScroll } },
  };

  return { fetchedOptions, autocompleteProps };
}
