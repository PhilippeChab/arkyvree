import { AppBar, Button, Toolbar, Typography } from "@mui/material";
import { Link } from "react-router-dom";

import { DashboardIcon, SignUpIcon } from "@/client/src/components/icons/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";

import { AppBrand, AppMain } from "./AppMain.tsx";

export function PublicLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <>
      <AppBar
        position="fixed"
        sx={{
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography
            variant="h6"
            noWrap
            component={Link}
            to="/"
            sx={{ fontWeight: 700, color: "inherit", textDecoration: "none" }}
          >
            <AppBrand />
          </Typography>

          {isAuthenticated ? (
            <Button color="inherit" startIcon={<DashboardIcon />} component={Link} to="/dashboard">
              Dashboard
            </Button>
          ) : (
            <Button color="inherit" startIcon={<SignUpIcon />} component={Link} to="/sign-up">
              Sign up
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <AppMain />
    </>
  );
}
