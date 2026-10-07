import { Box, Paper, Stack, Toolbar } from "@mui/material";
import type { ReactNode } from "react";

interface ListToolbarProps {
  /** At its start: a search, a picker, its filters */
  children?: ReactNode;
  /** At its end: the list's actions (Add, its filter and sort menus) */
  actions?: ReactNode;
}

/** The bar above a list, a page's or a tab's: what narrows or adds to it at its start, its actions at its end. */
export function ListToolbar({ children, actions }: ListToolbarProps) {
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 2 }}>
      <Toolbar sx={{ px: 2, py: 1 }}>
        <Stack direction="row" sx={{ alignItems: "center", flexGrow: 1, flexWrap: "wrap", columnGap: 3, rowGap: 1 }}>
          {children}
          <Box sx={{ flexGrow: 1 }} />
          {actions}
        </Stack>
      </Toolbar>
    </Paper>
  );
}
