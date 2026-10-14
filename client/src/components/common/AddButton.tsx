import { Button, type ButtonProps } from "@mui/material";

import { AddIcon } from "@/client/src/components/icons/index.ts";

interface AddButtonProps {
  /** Its icon alone, its label naming it (a phone's search bar, `SearchBar`). */
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: ButtonProps["size"];
  sx?: ButtonProps["sx"];
  variant?: ButtonProps["variant"];
}

/** Square, as tall as the small search field beside it, and as round: its row sets its height, the field's 40px. */
const COMPACT_SX = { minWidth: 0, width: 40, flexShrink: 0, p: 0, alignSelf: "stretch", borderRadius: 1 } as const;

/** A button that adds something (a row, a level, a contributor): its words after the add icon, or its icon alone. */
export function AddButton({
  label,
  onClick,
  variant = "contained",
  size,
  disabled,
  sx,
  compact = false,
}: AddButtonProps) {
  if (compact) {
    return (
      <Button
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        sx={[COMPACT_SX, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        <AddIcon />
      </Button>
    );
  }
  return (
    <Button variant={variant} size={size} startIcon={<AddIcon />} onClick={onClick} disabled={disabled} sx={sx}>
      {label}
    </Button>
  );
}
