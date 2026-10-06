import { DURATION, transitionOf } from "@/client/src/lib/animations.ts";

/** A table row whose `row-actions` buttons appear on hover or keyboard focus: spread into the row's `sx`. */
export const ROW_ACTIONS_HOVER_SX = { "&:hover .row-actions, &:focus-visible .row-actions": { opacity: 1 } };

/**
 * A row's action buttons (`className="row-actions"`): revealed on row hover where there is a
 * pointer, always shown on touch screens, and shown while one of them has keyboard focus.
 */
export const ROW_ACTIONS_SX = {
  "@media (hover: hover)": { opacity: 0 },
  "&:focus-within": { opacity: 1 },
  transition: transitionOf(["opacity"], DURATION.fast),
};
