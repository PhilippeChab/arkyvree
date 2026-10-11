import { Button, type ButtonProps } from "@mui/material";

import { AddIcon } from "@/client/src/components/icons/index.ts";

interface AddButtonProps {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  size?: ButtonProps["size"];
  sx?: ButtonProps["sx"];
  variant?: ButtonProps["variant"];
}

/** A button that adds something (a row, a level, a contributor): its words after the add icon. */
export function AddButton({ label, onClick, variant = "contained", size, disabled, sx }: AddButtonProps) {
  return (
    <Button variant={variant} size={size} startIcon={<AddIcon />} onClick={onClick} disabled={disabled} sx={sx}>
      {label}
    </Button>
  );
}
