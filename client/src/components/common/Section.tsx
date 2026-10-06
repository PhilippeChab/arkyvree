import { Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface SectionProps {
  /** Its heading, an `h2` */
  title?: string;
  /** Controls beside the title: an Add button */
  action?: ReactNode;
  /** A section that can't be undone from (deleting an account): its title and edge in the error's color */
  danger?: boolean;
  children: ReactNode;
}

/** A panel of a page: its surface, its padding, its title, and its blocks `spacing={3}` apart. */
export function Section({ title, action, danger = false, children }: SectionProps) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, ...(danger && { border: 1, borderColor: "error.main" }) }}>
      <Stack spacing={3}>
        {(title || action) && (
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
          >
            {title && (
              <Typography component="h2" variant="h5" sx={danger ? { color: "error.main" } : undefined}>
                {title}
              </Typography>
            )}
            {action}
          </Stack>
        )}
        {children}
      </Stack>
    </Paper>
  );
}
