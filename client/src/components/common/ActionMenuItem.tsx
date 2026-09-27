import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import type { ElementType } from "react";

/** What an action does, shown by its color (see docs/ui-buttons.md). */
type Intent = "default" | "destructive" | "caution" | "positive";

const INTENT_COLORS = {
  destructive: "error.main",
  caution: "warning.main",
  positive: "success.main",
} as const;

interface ActionMenuItemProps {
  icon: ElementType;
  label: string;
  /** A second line under the label ("Create your own editable copy"). */
  description?: string;
  intent?: Intent;
  onClick: () => void;
}

/** An item of a page's action menu: icon, label, and the intent's color. */
export function ActionMenuItem({ icon: Icon, label, description, intent = "default", onClick }: ActionMenuItemProps) {
  const color = intent === "default" ? undefined : INTENT_COLORS[intent];
  return (
    <MenuItem onClick={onClick} sx={color ? { color } : undefined}>
      <ListItemIcon sx={color ? { color: "inherit" } : undefined}>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText primary={label} secondary={description} />
    </MenuItem>
  );
}
