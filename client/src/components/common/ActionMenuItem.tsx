import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { ElementType } from "react";
import { Link } from "react-router-dom";

interface ActionMenuItemProps {
  icon: ElementType;
  label: string;
  /** A second line under the label ("Create your own editable copy"). */
  description?: string;
  intent?: Intent;
  onClick: () => void;
  /** A page of the app it opens, rather than an action it takes */
  to?: string;
  /** A page elsewhere it opens in a new tab (the help center) */
  href?: string;
}

/** What an action does, shown by its color (see docs/ui-buttons.md). */
type Intent = "default" | "destructive" | "caution" | "positive";

const INTENT_COLORS = {
  destructive: "error.main",
  caution: "warning.main",
  positive: "success.main",
} as const;

/** An item of a page's action menu: icon, label, and the intent's color. */
export function ActionMenuItem({
  icon: Icon,
  label,
  description,
  intent = "default",
  onClick,
  to,
  href,
}: ActionMenuItemProps) {
  const color = intent === "default" ? undefined : INTENT_COLORS[intent];
  const link = to
    ? { component: Link, to }
    : href
      ? { component: "a", href, target: "_blank", rel: "noopener noreferrer" }
      : {};
  return (
    <MenuItem {...link} onClick={onClick} sx={color ? { color } : undefined}>
      <ListItemIcon sx={color ? { color: "inherit" } : undefined}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText primary={label} secondary={description} />
    </MenuItem>
  );
}
