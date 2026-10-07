import { type LinkProps, Link as MuiLink } from "@mui/material";
import type { ReactNode } from "react";

interface LinkButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: LinkProps["variant"];
  sx?: LinkProps["sx"];
}

/** An action written as a link (Resend, Try the demo): a button, underlined on hover. */
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
