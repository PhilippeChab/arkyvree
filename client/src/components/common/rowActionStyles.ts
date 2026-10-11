import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";

/** A row that holds `RowActions`, which show on its hover or its keyboard focus: spread into the row's `sx`. */
export const ROW_ACTIONS_HOVER_SX = { "&:hover .row-actions, &:focus-visible .row-actions": { opacity: 1 } };

/**
 * A row's actions (`RowActions`), at its end: revealed on its hover where there is a pointer, always shown on a touch
 * screen, and shown while one of them has the keyboard's focus.
 */
export const ROW_ACTIONS_SX = {
  justifyContent: "flex-end",
  "@media (hover: hover)": { opacity: 0 },
  "&:focus-within": { opacity: 1 },
  transition: transitionOf(["opacity"], DURATION.brisk),
};
