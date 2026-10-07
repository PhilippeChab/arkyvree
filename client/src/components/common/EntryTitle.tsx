import { type SxProps, type Theme, Typography } from "@mui/material";
import { type ReactNode } from "react";

interface EntryTitleProps {
  children: ReactNode;
  /** Its level: `h3` in a panel's list, `h4` under a sub-heading or another entry. */
  component?: "h3" | "h4";
  sx?: SxProps<Theme>;
}

/** The name of an entry in a panel's list (a feat on the sheet, a bonded creature): a heading, red at 600. */
export function EntryTitle({ children, component = "h3", sx }: EntryTitleProps) {
  return (
    <Typography
      component={component}
      sx={[
        { fontWeight: 600, color: "primary.main", typography: { xs: "body1", sm: "h6" } },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Typography>
  );
}
