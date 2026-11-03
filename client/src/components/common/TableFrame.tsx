import { Paper, type SxProps, TableContainer, type Theme } from "@mui/material";
import { type ReactNode } from "react";

interface TableFrameProps {
  /** The `Table`. */
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * A table that stands on a page or in a dialog: outlined, under the theme's header, scrolling sideways on a narrow
 * screen. A table inside a panel (a sheet section, a wizard step) stands bare: its panel frames it.
 */
export function TableFrame({ children, sx }: TableFrameProps) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={[{ overflowX: "auto" }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {children}
    </TableContainer>
  );
}
