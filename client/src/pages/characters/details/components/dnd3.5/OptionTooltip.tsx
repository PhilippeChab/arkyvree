import { Tooltip } from "@mui/material";
import type { ReactElement } from "react";

interface OptionTooltipProps {
  description?: string | null;
  /** What the option asks that the character lacks: shown instead of its description, as a tree. */
  requirementTree?: string | null;
  /** The longest a description shows, cut with "…" (a picked chip's). */
  maxLength?: number;
  /** A description's width, beyond the tooltip's own (a class plan's options). */
  descriptionWidth?: number;
  children: ReactElement;
}

/** A requirement tree, line by line, as the engine lays it out. */
const TREE_SX = { maxWidth: "none", whiteSpace: "pre", fontFamily: "monospace" } as const;

/** What an option of the level-up wizard is (its description), or what it asks that the character lacks (its tree). */
export function OptionTooltip({
  description,
  requirementTree,
  maxLength,
  descriptionWidth,
  children,
}: OptionTooltipProps) {
  const text = description ?? "";
  const shown = maxLength !== undefined && text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  return (
    <Tooltip
      describeChild
      title={requirementTree || shown}
      placement="right"
      enterDelay={300}
      arrow
      slotProps={{
        tooltip: {
          sx: [!!requirementTree && TREE_SX, !requirementTree && !!descriptionWidth && { maxWidth: descriptionWidth }],
        },
      }}
    >
      {children}
    </Tooltip>
  );
}
