import { type AutocompleteInputChangeReason } from "@mui/material";
import { useState } from "react";

import { ScrollSafeListbox } from "@/client/src/components/common/index.ts";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import { emptyOptionsText } from "@/client/src/lib/errorMessage.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";

/**
 * A picker's entities of a kind (`type`), searched on the server as it's typed and paged in as its listbox scrolls,
 * `limit` a page, those of a scope where its kind takes one (an aptitude's: its feats' or its spells'): its fetched
 * options, and its Autocomplete's props, whose failure to load names them (`what`).
 */
export function useEntityOptions(
  rulesetId: string,
  type: string,
  { enabled = true, limit, scope, what }: { enabled?: boolean; limit: number; scope?: string; what: string },
) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: fetchedOptions,
    isLoading,
    error,
    onScroll,
  } = useListboxQuery({ ...entityOptionsQuery(rulesetId, type, debouncedSearch, { limit, scope }), enabled });

  // The server searches and pages the list; the Autocomplete only shows it.
  const autocompleteProps = {
    getOptionLabel: (option: EntityRow) => option.name,
    isOptionEqualToValue: (option: EntityRow, val: EntityRow) => option.id === val.id,
    onInputChange: (_: unknown, inputValue: string, reason: AutocompleteInputChangeReason) => {
      if (reason === "input") setSearch(inputValue);
    },
    filterOptions: (options: EntityRow[]) => options,
    loading: isLoading,
    noOptionsText: emptyOptionsText(what, error),
    fullWidth: true,
    slotProps: { listbox: { component: ScrollSafeListbox, onScroll } },
  };

  return { fetchedOptions, autocompleteProps };
}
