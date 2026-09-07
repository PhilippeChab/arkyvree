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
