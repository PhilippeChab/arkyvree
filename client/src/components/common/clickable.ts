import type { KeyboardEvent } from "react";

/** The pointer and the keyboard focus ring of a `clickableProps` element. */
export const CLICKABLE_SX = {
  cursor: "pointer",
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
};

/**
 * A row or card that opens or expands on click, reachable from the keyboard too: focusable
 * with Tab and activated with Enter or Space. Spread into the element, with `CLICKABLE_SX`
 * in its `sx`.
 */
export function clickableProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // A key pressed on a control inside the element (a row action, a chip) is that control's.
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
