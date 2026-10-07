import { alpha, Button, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import { ScienceIcon } from "@/client/src/components/icons/index.ts";
import { useDemoTimeRemaining } from "@/client/src/hooks/index.ts";

export function DemoBanner() {
  const navigate = useNavigate();
  const { isDemo, urgency, hours, minutes, seconds } = useDemoTimeRemaining();

  if (!isDemo) return null;

  const goToSignUp = () => navigate("/sign-up");

  const label =
    urgency === "expired"
      ? "Demo expired"
      : urgency === "critical"
        ? `Demo ends in ${minutes}:${seconds.toString().padStart(2, "0")}`
        : `Demo mode — ${hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} left`;

  return (
    <Stack direction="row" sx={{ position: "sticky", top: 0, zIndex: 1, justifyContent: "center", pt: 1.5, px: 2 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
          py: 0.75,
          px: 2.5,
          borderRadius: 6,
          // The bright gold on both themes: the pill reads as a highlight.
          bgcolor: (theme) => alpha(theme.palette.gold.light, theme.palette.mode === "dark" ? 0.12 : 0.15),
          border: 1,
          borderColor: (theme) => alpha(theme.palette.gold.main, 0.3),
          backdropFilter: "blur(12px)",
          boxShadow: (theme) => theme.boxShadows.banner,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <ScienceIcon sx={{ fontSize: 18, color: "warning.main" }} />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: (theme) => (theme.palette.mode === "dark" ? "warning.light" : "warning.dark"),
            }}
          >
            {label}
          </Typography>
        </Stack>
        <Button
          size="small"
          onClick={goToSignUp}
          sx={{
            py: 0,
            px: 1.5,
            minHeight: 26,
            fontSize: "0.75rem",
            fontWeight: 600,
            borderRadius: 4,
            color: (theme) => (theme.palette.mode === "dark" ? "warning.light" : "warning.dark"),
            bgcolor: (theme) => alpha(theme.palette.gold.main, theme.palette.mode === "dark" ? 0.15 : 0.12),
            "&:hover": {
              bgcolor: (theme) => alpha(theme.palette.gold.main, theme.palette.mode === "dark" ? 0.25 : 0.2),
            },
          }}
        >
          Sign Up
        </Button>
      </Stack>
    </Stack>
  );
}
