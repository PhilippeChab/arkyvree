import { Typography } from "@mui/material";
import { type ReactNode } from "react";

interface SubsectionTitleProps {
  children: ReactNode;
  /** Its level: `h3` under a card's or a dialog's title, deeper under another sub-heading. */
  component?: "h3" | "h4" | "h5";
}

/**
 * A heading inside a card, a panel, a dialog or a wizard step: a subtitle at 600, 8px above its content (the `Stack`
 * it leads takes `spacing={1}`).
 */
export function SubsectionTitle({ children, component = "h3" }: SubsectionTitleProps) {
  return (
    <Typography variant="subtitle1" component={component} sx={{ fontWeight: 600 }}>
      {children}
    </Typography>
  );
}
