import { useSearchParams } from "react-router-dom";

import { oneOf } from "@/client/src/lib/oneOf.ts";

import { useSearchText } from "./useSearchText.ts";
import { useUpdateSearchParams } from "./useUpdateSearchParams.ts";

type Direction = "asc" | "desc";

/**
 * A list's search and sort, kept in the URL (unknown values fall back to the default sort), with the search bar props
 * that change them. The search is `useSearchText`'s, and `search` is it debounced, for the query; a sort change pushes
 * an entry, so Back restores it.
 */
export function useListParams<TField extends string>(
  sortFields: readonly TField[],
  defaultSort: { orderBy: TField; orderDir: Direction },
) {
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const { search, searchBarProps: searchTextProps } = useSearchText();
  const orderBy = oneOf(searchParams.get("orderBy"), sortFields, defaultSort.orderBy);
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], defaultSort.orderDir);

  const searchBarProps = {
    ...searchTextProps,
    sortField: orderBy,
    sortDirection: orderDir,
    onSortChange: (field: TField, direction: Direction) => updateSearchParams({ orderBy: field, orderDir: direction }),
  };

  return { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps };
}
