import { ExpandMoreIcon } from "@/client/src/components/icons/index.ts";
import { DURATION, transitionOf } from "@/client/src/theme/animations.ts";

interface ExpandArrowProps {
  open: boolean;
}

/** Whether a group or a row's details show, leading the toggle that shows them (`toggleProps`): turned up while open. */
export function ExpandArrow({ open }: ExpandArrowProps) {
  return (
    <ExpandMoreIcon
      fontSize="small"
      sx={{ transition: transitionOf(["transform"], DURATION.fast), transform: open ? "rotate(180deg)" : "none" }}
    />
  );
}
