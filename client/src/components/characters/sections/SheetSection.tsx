import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface SheetSectionProps {
  title: string;
  /** Controls shown beside the title, e.g. an Add button. */
  action?: ReactNode;
  children: ReactNode;
}

/** Titled panel of the character sheet. */
export function SheetSection({ title, action, children }: SheetSectionProps) {
  return (
    <Stack component={Paper} spacing={3} sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <Typography component="h2" sx={{ fontWeight: 600, color: "primary.main", typography: { xs: "h6", sm: "h5" } }}>
          {title}
        </Typography>
        {action}
      </Stack>
      <Box>{children}</Box>
    </Stack>
  );
}
