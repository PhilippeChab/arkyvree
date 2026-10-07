import { Button, type ButtonProps } from "@mui/material";

import { AddIcon } from "@/client/src/components/icons/index.ts";

interface AddButtonProps {
  label: string;
  onClick: () => void;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  sx?: ButtonProps["sx"];
}

/** A button that adds something (a row, a level, a contributor): its words after the add icon. */
export function AddButton({ label, onClick, variant = "contained", size, disabled, sx }: AddButtonProps) {
  return (
    <Button variant={variant} size={size} startIcon={<AddIcon />} onClick={onClick} disabled={disabled} sx={sx}>
      {label}
    </Button>
  );
}
