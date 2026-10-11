import { Box, IconButton, Stack } from "@mui/material";
import type { ReactNode } from "react";

import { CLICKABLE_SX, toggleProps } from "./clickable.ts";
import { ExpandArrow } from "./ExpandArrow.tsx";

interface ToggleLabelProps {
  children: ReactNode;
  /** Given when what it shows holds a link (a feat's name): the arrow alone is the button, and this names it. */
  label?: string;
  onToggle: () => void;
  open: boolean;
}

/**
 * A heading's toggle: its arrow, then its label, one button that shows or hides what the heading titles. The heading
 * holds it, so it stays a heading: `<SubsectionTitle><ToggleLabel …>Granted (3)</ToggleLabel></SubsectionTitle>`.
 */
export function ToggleLabel({ open, onToggle, label, children }: ToggleLabelProps) {
  if (label) {
    return (
      <Stack component="span" direction="row" spacing={0.5} sx={{ display: "inline-flex", alignItems: "center" }}>
        <IconButton size="small" aria-label={label} aria-expanded={open} onClick={onToggle} sx={{ p: 0 }}>
          <ExpandArrow open={open} />
        </IconButton>
        <Box component="span">{children}</Box>
      </Stack>
    );
  }
  return (
    <Stack
      component="span"
      direction="row"
      spacing={0.5}
      {...toggleProps(open, onToggle)}
      // It fills its heading, so a click anywhere on the heading's row toggles it
      sx={[CLICKABLE_SX, { alignItems: "center" }]}
    >
      <ExpandArrow open={open} />
      <Box component="span">{children}</Box>
    </Stack>
  );
}
