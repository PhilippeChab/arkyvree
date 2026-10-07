import type { KeyboardEvent, MouseEvent } from "react";

/** What can sit inside a clickable element and act on its own: its click isn't the element's */
const INNER_CONTROLS = "a, button, input, select, textarea, [role='button']";

/** The pointer and the keyboard focus ring of a `clickableProps` element. */
export const CLICKABLE_SX = {
  cursor: "pointer",
  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
};

/**
 * A row or card that opens or expands on click, reachable from the keyboard too: focusable
 * with Tab and activated with Enter or Space. Spread into the element, with `CLICKABLE_SX`
 * in its `sx`. A click or a key on a control inside it (a link, a row action, a chip), or in a menu or a dialog it
 * opened, is that control's: none of them stops its event.
 */
export function clickableProps(onActivate: () => void) {
  return {
    tabIndex: 0,
    onClick: (event: MouseEvent<HTMLElement>) => {
      const { target, currentTarget } = event;
      // A click in a portal a child opened (its menu, its dialog) bubbles here through React, outside the element
      if (!(target instanceof Node) || !currentTarget.contains(target)) return;
      const control = target instanceof Element ? target.closest(INNER_CONTROLS) : null;
      if (control && control !== currentTarget && currentTarget.contains(control)) return;
      onActivate();
    },
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

/**
 * A header or a table row that shows or hides what's under it, reachable from the keyboard, saying whether it's open,
 * its `ExpandArrow` first: a header is a button, a table row keeps its role.
 */
export function toggleProps(open: boolean, onToggle: () => void, role: "button" | "row" = "button") {
  return { ...clickableProps(onToggle), role, "aria-expanded": open };
}
