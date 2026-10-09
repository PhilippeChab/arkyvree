import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Apply several search param changes at once, e.g. a sort field and direction. Empty values remove the param. A
 * change is a picked filter, view or sort, which pushes a history entry so Back restores it; typed text replaces its
 * own (`useSearchText`).
 */
export function useUpdateSearchParams() {
  const [, setSearchParams] = useSearchParams();

  return useCallback(
    (updates: Record<string, string | null | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      });
    },
    [setSearchParams],
  );
}
