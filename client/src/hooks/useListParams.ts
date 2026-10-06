import { useSearchParams } from "react-router-dom";

import { oneOf } from "@/client/src/lib/oneOf.ts";

import { useDebouncedValue } from "./useDebouncedValue.ts";
import { useUpdateSearchParams } from "./useSearchParam.ts";

type Direction = "asc" | "desc";

/**
 * A list's search and sort, kept in the URL (unknown values fall back to the default sort), with the search bar props
 * that change them. The search is kept as it's typed, replacing the history entry, and `search` is it debounced, for
 * the query; a sort change pushes an entry, so Back restores it.
 */
export function useListParams<TField extends string>(
  sortFields: readonly TField[],
  defaultSort: { orderBy: TField; orderDir: Direction },
) {
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const searchText = searchParams.get("search") || "";
  const search = useDebouncedValue(searchText);
  const orderBy = oneOf(searchParams.get("orderBy"), sortFields, defaultSort.orderBy);
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], defaultSort.orderDir);

  const searchBarProps = {
    searchValue: searchText,
    onSearchChange: (value: string) => updateSearchParams({ search: value }, { replace: true }),
    sortField: orderBy,
    sortDirection: orderDir,
    onSortChange: (field: TField, direction: Direction) => updateSearchParams({ orderBy: field, orderDir: direction }),
  };

  return { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps };
}
