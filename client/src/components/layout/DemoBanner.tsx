import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import { DemoIcon } from "@/client/src/components/icons/index.ts";
import { useDemoTimeRemaining } from "@/client/src/hooks/index.ts";
import { brandGoldTint } from "@/client/src/theme/brandGold.ts";

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
    <Box sx={{ position: "sticky", top: 0, zIndex: 1, display: "flex", justifyContent: "center", pt: 1.5, px: 2 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          py: 0.75,
          px: 2.5,
          borderRadius: 6,
          // The bright gold on both themes: the pill reads as a highlight.
          bgcolor: (theme) => brandGoldTint(true, theme.palette.mode === "dark" ? 0.12 : 0.15),
          border: 1,
          borderColor: (theme) => brandGoldTint(theme.palette.mode === "dark", 0.3),
          backdropFilter: "blur(12px)",
          boxShadow: (theme) => `0 2px 12px ${theme.palette.shadow}`,
        }}
      >
        <DemoIcon fontSize="compact" sx={{ color: "warning.main" }} />
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: (theme) => (theme.palette.mode === "dark" ? "warning.light" : "warning.dark"),
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
            typography: "caption",
            fontWeight: 600,
            borderRadius: 4,
            color: (theme) => (theme.palette.mode === "dark" ? "warning.light" : "warning.dark"),
            bgcolor: (theme) =>
              brandGoldTint(theme.palette.mode === "dark", theme.palette.mode === "dark" ? 0.15 : 0.12),
            "&:hover": {
              bgcolor: (theme) =>
                brandGoldTint(theme.palette.mode === "dark", theme.palette.mode === "dark" ? 0.25 : 0.2),
            },
          }}
        >
          Sign up
        </Button>
      </Box>
    </Box>
  );
}
