import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A filter kept in the URL (`key`), so it survives navigation: its value, and the change that sets it. A change pushes
 * a history entry, as a list's filters and sort do (`useUpdateSearchParams`), so Back restores it; typed text passes
 * `{ replace: true }` (`useSearchText`), so Back doesn't step through every partial search.
 */
export function useSearchParam(key: string, defaultValue = "") {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string, options?: { replace?: boolean }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newValue === defaultValue) next.delete(key);
        else next.set(key, newValue);

        return next;
      }, options);
    },
    [key, defaultValue, setSearchParams],
  );

  return { value, setValue };
}
