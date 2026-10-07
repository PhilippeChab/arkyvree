import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

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
