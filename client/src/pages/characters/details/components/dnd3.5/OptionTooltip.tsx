import { Tooltip } from "@mui/material";
import type { ReactElement } from "react";

import { truncate } from "@/client/src/lib/truncate.ts";

interface OptionTooltipProps {
  children: ReactElement;
  description?: string | null;
  /** A description's width, beyond the tooltip's own (a class plan's options). */
  descriptionWidth?: number;
  /** The longest a description shows, cut with "…" (a picked chip's). */
  maxLength?: number;
  /** What the option asks that the character lacks: shown instead of its description, as a tree. */
  requirementTree?: string | null;
}

/**
 * Where it goes when the option's right has no room for it: its left, else under or over it, where the viewport keeps
 * it whole (an option as wide as the wizard leaves neither side room).
 */
const POPPER_MODIFIERS = [{ name: "flip", options: { fallbackPlacements: ["left", "bottom", "top"] } }];

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
  const shown = maxLength === undefined ? text : truncate(text, maxLength);
  return (
    <Tooltip
      describeChild
      title={requirementTree || shown}
      placement="right"
      enterDelay={300}
      slotProps={{
        popper: { modifiers: POPPER_MODIFIERS },
        tooltip: {
          sx: [!!requirementTree && TREE_SX, !requirementTree && !!descriptionWidth && { maxWidth: descriptionWidth }],
        },
      }}
    >
      {children}
    </Tooltip>
  );
}
