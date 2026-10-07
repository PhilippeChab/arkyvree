import { useState } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

import { useDebouncedValue } from "./useDebouncedValue.ts";
import { useOnChange } from "./useOnChange.ts";
import { useSearchParam } from "./useSearchParam.ts";

/**
 * A list's search, kept in the URL (`key`): the search bar's props, which show and change the text, and the search
 * itself, debounced, for the query. The text is the hook's own state, since the router applies a location change in a
 * transition, which can't feed a text input (the keys typed before it commits are lost, and the caret jumps to the
 * end). It's written to the URL as it's typed, replacing the history entry, and takes the URL's at any other navigation
 * (Back, a link), even one the router commits together with a replace of its own.
 */
export function useSearchText(key = "search") {
  const { value: urlText, setValue: setUrlText } = useSearchParam(key);
  const { key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  const [text, setText] = useState(urlText);
  useOnChange(locationKey, () => {
    if (navigationType !== NavigationType.Replace) setText(urlText);
  });
  const search = useDebouncedValue(text);
  const onSearchChange = (next: string) => {
    setText(next);
    setUrlText(next, { replace: true });
  };
  return { search, searchBarProps: { searchValue: text, onSearchChange } };
}
