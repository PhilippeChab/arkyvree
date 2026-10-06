import { Chip, type ChipProps, Tooltip } from "@mui/material";
import type { MouseEvent } from "react";
import { Link } from "react-router-dom";

import type { SvgIconComponent } from "@/client/src/components/icons/index.ts";

interface TagChipProps {
  tag: Tag;
  /** `small` in a table or a card, `medium` in a page's header */
  size?: "small" | "medium";
}

/** A role, a status or a fact, as a chip shows it: its icon, its words, its color, and what it does */
export interface Tag {
  /** What kind of thing it is, when an icon says it (a role, a status); a plain fact has none */
  icon?: SvgIconComponent;
  label: string;
  color: ChipProps["color"];
  /** What it means, on hover */
  tooltip?: string;
  /** The page it opens */
  to?: string;
  /** Opens its page in a new tab, as a character sheet's links do, so the sheet keeps its place */
  newTab?: boolean;
  /** Loads what it opens, as the pointer rests on it */
  prefetch?: () => void;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onDelete?: () => void;
}

/** A role, a status or a fact: an outlined chip with its icon, the same everywhere. */
export function TagChip({ tag, size = "small" }: TagChipProps) {
  const { icon: Icon, label, color, tooltip, to, newTab, prefetch, onClick, onDelete } = tag;
  const props = {
    icon: Icon && <Icon fontSize={size === "medium" ? "small" : "tiny"} />,
    label,
    size,
    color,
    variant: "outlined",
    sx: { fontWeight: "fontWeightMedium" },
    onMouseEnter: prefetch,
    onFocus: prefetch,
    onDelete:
      onDelete &&
      ((event: MouseEvent) => {
        // A tag that links somewhere deletes without following its link
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }),
  } as const;
  const chip = to ? (
    <Chip {...props} component={Link} to={to} target={newTab ? "_blank" : undefined} clickable />
  ) : (
    <Chip {...props} onClick={onClick} clickable={!!onClick} />
  );
  return tooltip ? (
    <Tooltip describeChild title={tooltip}>
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
