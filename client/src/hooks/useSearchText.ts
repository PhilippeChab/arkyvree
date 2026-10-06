import { useDebouncedValue } from "./useDebouncedValue.ts";
import { useSearchParam } from "./useSearchParam.ts";

/**
 * A list's search, kept in the URL as it's typed (`key`): the search bar's props, which show and change the text, and
 * the search itself, debounced, for the query.
 */
export function useSearchText(key = "search") {
  const [text, setText] = useSearchParam(key);
  const search = useDebouncedValue(text);
  return { search, searchBarProps: { searchValue: text, onSearchChange: setText } };
}
