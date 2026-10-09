import { useRef } from "react";

/** How long a pointer rests on a row before its page is warmed: one passing over it leaves it be. */
const HOVER_DELAY = 150;

/**
 * Warms what a table's row opens, as it's about to be opened: 150ms into a hover, at once on focus. Gives the props a
 * row spreads, for its record; none without a `prefetch`.
 */
export function useRowPrefetch<T>(prefetch: ((row: T) => void) | undefined) {
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (row: T) =>
    prefetch
      ? {
          onMouseEnter: () => {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => prefetch(row), HOVER_DELAY);
          },
          onMouseLeave: () => clearTimeout(hoverTimer.current),
          onFocus: () => prefetch(row),
        }
      : {};
}
