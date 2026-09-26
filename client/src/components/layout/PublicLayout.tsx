import { Dashboard as DashboardIcon, PersonAdd as SignUpIcon } from "@mui/icons-material";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { AppBar, Button, Toolbar, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { AppBrand, AppMain } from "./AppShell.tsx";

export function PublicLayout() {
  const navigate = useNavigate();
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
            component="div"
            sx={{ fontWeight: 700, cursor: "pointer" }}
            onClick={() => navigate("/")}
          >
            <AppBrand />
          </Typography>

          {isAuthenticated ? (
            <Button
              color="inherit"
              startIcon={<DashboardIcon />}
              onClick={() => navigate("/dashboard")}
            >
              Dashboard
            </Button>
          ) : (
            <Button
              color="inherit"
              startIcon={<SignUpIcon />}
              onClick={() => navigate("/sign-up")}
            >
              Sign up
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <AppMain />
    </>
  );
}
