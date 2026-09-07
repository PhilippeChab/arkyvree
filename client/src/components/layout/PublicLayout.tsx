import { Dashboard as DashboardIcon, PersonAdd as SignUpIcon } from "@mui/icons-material";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { AppBar, Box, Button, Toolbar, Typography } from "@mui/material";
import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Footer } from "./Footer.tsx";

export function PublicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

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
            <img
              src="/pwa-192x192.png"
              alt=""
              style={{ width: 28, height: 28, marginRight: 8, verticalAlign: "middle" }}
            />
            Arkyvree
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

      <Box
        component="main"
        sx={{
          position: "fixed",
          top: 64,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: "background.default",
          overflow: "auto",
          scrollbarGutter: "stable",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box sx={{ width: "100%", maxWidth: "1200px", px: { xs: 2, md: 3 }, flex: 1 }}>
          <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><DiceSpinner /></Box>}>
            <Outlet />
          </Suspense>
        </Box>
        <Footer />
      </Box>
    </>
  );
}
