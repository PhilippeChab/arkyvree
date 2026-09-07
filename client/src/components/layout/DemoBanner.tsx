import { Box, Button, Typography } from "@mui/material";
import { Science as ScienceIcon } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";

import { useDemoTimeRemaining } from "@/client/src/hooks/index.ts";

export function DemoBanner() {
  const navigate = useNavigate();
  const { isDemo, urgency, hours, minutes, seconds } = useDemoTimeRemaining();

  if (!isDemo) return null;

  const goToSignUp = () => navigate("/sign-up");

  const label = urgency === "expired"
    ? "Demo expired"
    : urgency === "critical"
      ? `Demo ends in ${minutes}:${seconds.toString().padStart(2, "0")}`
      : `Demo mode — ${hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} left`;

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1,
        display: "flex",
        justifyContent: "center",
        pt: 1.5,
        px: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          py: 0.75,
          px: 2.5,
          borderRadius: 6,
          bgcolor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(245, 197, 66, 0.12)"
              : "rgba(245, 197, 66, 0.15)",
          border: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "dark"
              ? "rgba(245, 197, 66, 0.3)"
              : "rgba(191, 144, 0, 0.3)",
          backdropFilter: "blur(12px)",
          boxShadow: (theme) =>
            theme.palette.mode === "dark"
              ? "0 2px 12px rgba(0,0,0,0.3)"
              : "0 2px 12px rgba(0,0,0,0.08)",
        }}
      >
        <ScienceIcon sx={{ fontSize: 18, color: "warning.main" }} />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: (theme) =>
              theme.palette.mode === "dark" ? "warning.light" : "warning.dark",
          }}
        >
          {label}
        </Typography>
        <Button
          size="small"
          onClick={goToSignUp}
          sx={{
            ml: 0.5,
            py: 0,
            px: 1.5,
            minHeight: 26,
            fontSize: "0.75rem",
            fontWeight: 600,
            borderRadius: 4,
            color: (theme) =>
              theme.palette.mode === "dark" ? "warning.light" : "warning.dark",
            bgcolor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(245, 197, 66, 0.15)"
                : "rgba(191, 144, 0, 0.12)",
            "&:hover": {
              bgcolor: (theme) =>
                theme.palette.mode === "dark"
                  ? "rgba(245, 197, 66, 0.25)"
                  : "rgba(191, 144, 0, 0.2)",
            },
          }}
        >
          Sign up
        </Button>
      </Box>
    </Box>
  );
}
