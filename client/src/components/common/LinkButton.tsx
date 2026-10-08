import { type LinkProps, Link as MuiLink } from "@mui/material";
import type { ReactNode } from "react";

interface LinkButtonProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  sx?: LinkProps["sx"];
  variant?: LinkProps["variant"];
}

/** An action written as a link (Resend, Try the Demo): a button, underlined on hover, in its own look. */
export function LinkButton({ children, onClick, disabled, variant, sx }: LinkButtonProps) {
  return (
    <MuiLink
      component="button"
      type="button"
      underline="hover"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      sx={sx}
    >
      {children}
    </MuiLink>
  );
}
