import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * useState-like hook backed by URL search params so values survive navigation.
 * Uses `replace: true` to avoid polluting browser history on every keystroke.
 */
export function useSearchParam(key: string, defaultValue = ""): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue === defaultValue) {
            next.delete(key);
          } else {
            next.set(key, newValue);
          }
          return next;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setSearchParams],
  );

  return [value, setValue];
}

/**
 * Apply several search param changes at once, e.g. a sort field and direction.
 * Empty values remove the param. Filter and sort changes push a history entry
 * so Back restores them; pass `{ replace: true }` for typed search so Back
 * doesn't step through every partial query.
 */
export function useUpdateSearchParams() {
  const [, setSearchParams] = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null | undefined>, options?: { replace?: boolean }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      }, options);
    },
    [setSearchParams],
  );
}
