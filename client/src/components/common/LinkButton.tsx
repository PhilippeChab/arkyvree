import { type LinkProps, Link as MuiLink } from "@mui/material";
import type { ReactNode } from "react";

interface LinkButtonProps {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  /** Its type, when it stands on its own (Try the Demo); without one it takes its line's (a sentence's "Resend"). */
  variant?: LinkProps["variant"];
}

/** A link in a line of text: its font, and its baseline, a button's own being neither. */
const IN_LINE_SX = { font: "inherit", verticalAlign: "baseline" } as const;

/** An action written as a link (Resend, Try the Demo): a button, underlined on hover, in its own look. */
export function LinkButton({ children, onClick, disabled, variant }: LinkButtonProps) {
  return (
    <MuiLink
      component="button"
      type="button"
      underline="hover"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      sx={[!variant && IN_LINE_SX]}
    >
      {children}
    </MuiLink>
  );
}
