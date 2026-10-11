import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";

interface ExpandArrowProps {
  open: boolean;
}

/**
 * Whether a group, a row's details or a popover show: before a group's toggle (`toggleProps`), after a link's words when
 * it opens a popover (`LinkButton`'s `expanded`); turned up while open.
 */
export function ExpandArrow({ open }: ExpandArrowProps) {
  return (
    <ExpandMoreIcon
      fontSize="small"
      sx={{ transition: transitionOf(["transform"], DURATION.fast), transform: open ? "rotate(180deg)" : "none" }}
    />
  );
}
