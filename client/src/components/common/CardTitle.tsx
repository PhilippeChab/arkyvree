import { Typography } from "@mui/material";
import { type ReactNode } from "react";

interface CardTitleProps {
  children: ReactNode;
  /** A card about losing something (the profile's Delete Account): its title in the error's color. */
  danger?: boolean;
}

/** A card's or a panel's title (a sheet section, a profile card, the dashboard's notifications): an `h2`, red at 600. */
export function CardTitle({ children, danger = false }: CardTitleProps) {
  return (
    <Typography
      component="h2"
      sx={{ fontWeight: 600, color: danger ? "error.main" : "primary.main", typography: { xs: "h6", sm: "h5" } }}
    >
      {children}
    </Typography>
  );
}
