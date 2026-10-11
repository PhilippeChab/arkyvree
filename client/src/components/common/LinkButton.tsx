import { type LinkProps, Link as MuiLink, Stack } from "@mui/material";
import type { MouseEvent, ReactNode } from "react";

import { ExpandArrow } from "./ExpandArrow.tsx";

interface LinkButtonProps {
  children: ReactNode;
  disabled?: boolean;
  /**
   * Given when it opens a popover dialog (a class's levels, on a sheet's header; never an inline `Collapse`): whether
   * it's open, which `aria-expanded` says and its arrow, after its words, shows.
   */
  expanded?: boolean;
  /** Its name, when its words don't say what it opens: "Fighter 3 Levels" */
  label?: string;
  /** Its click, whose target a popover it opens is anchored to */
  onClick: (event: MouseEvent<HTMLElement>) => void;
  /** Its type, when it stands on its own (Try the Demo); without one it takes its line's (a sentence's "Resend"). */
  variant?: LinkProps["variant"];
}

/** A link in a line of text: its font, and its baseline, a button's own being neither. */
const IN_LINE_SX = { font: "inherit", verticalAlign: "baseline" } as const;

/**
 * An action written as a link (Resend, Try the Demo, a class's levels on a sheet's header): a button, underlined on
 * hover, in its own look.
 */
export function LinkButton({ children, onClick, disabled, expanded, label, variant }: LinkButtonProps) {
  return (
    <MuiLink
      component="button"
      type="button"
      underline="hover"
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      aria-haspopup={expanded === undefined ? undefined : "dialog"}
      sx={[!variant && IN_LINE_SX]}
    >
      {expanded === undefined ? (
        children
      ) : (
        // Its words on the line's baseline, its arrow centered on them
        <Stack component="span" direction="row" sx={{ display: "inline-flex", alignItems: "center" }}>
          {children}
          <ExpandArrow open={expanded} />
        </Stack>
      )}
    </MuiLink>
  );
}
