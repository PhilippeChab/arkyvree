import { useSearchParams } from "react-router-dom";

import { oneOf } from "@/client/src/lib/oneOf.ts";

import { useUpdateSearchParams } from "./useSearchParam.ts";

type Direction = "asc" | "desc";

/**
 * A list's search and sort, kept in the URL (unknown values fall back to the
 * default sort), with the search bar props that change them. Typing replaces
 * the history entry; a sort change pushes one, so Back restores it.
 */
export function useListParams<TField extends string>(
  sortFields: readonly TField[],
  defaultSort: { orderBy: TField; orderDir: Direction },
) {
  const [searchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();
  const search = searchParams.get("search") || "";
  const orderBy = oneOf(searchParams.get("orderBy"), sortFields, defaultSort.orderBy);
  const orderDir = oneOf(searchParams.get("orderDir"), ["asc", "desc"], defaultSort.orderDir);

  const searchBarProps = {
    searchValue: search,
    onSearchChange: (value: string) => updateSearchParams({ search: value }, { replace: true }),
    sortField: orderBy,
    sortDirection: orderDir,
    onSortChange: (field: TField, direction: Direction) => updateSearchParams({ orderBy: field, orderDir: direction }),
  };

  return { searchParams, updateSearchParams, search, orderBy, orderDir, searchBarProps };
}
