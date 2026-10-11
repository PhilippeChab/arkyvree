import { type MouseEvent, useState } from "react";

/** A menu that opens from what was clicked: its anchor while open, and how it opens and closes. */
export function useAnchorMenu() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  return {
    anchorEl,
    open: anchorEl !== null,
    openMenu: (event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    closeMenu: () => setAnchorEl(null),
    /** A menu item's click: the menu closes, then `then` runs. */
    closeMenuAnd: (then: () => void) => () => {
      setAnchorEl(null);
      then();
    },
  };
}
