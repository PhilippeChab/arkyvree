import { alpha, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle: ReactNode;
  /** Primary page action, e.g. a Create button. Stacks under the text on mobile. */
  action?: ReactNode;
  /**
   * `hero`: solid brand gradient, for account and activity pages.
   * `tinted`: light wash, for the content lists (rulesets, characters, campaigns).
   */
  variant?: "hero" | "tinted";
}

export function PageHeader({ title, subtitle, action, variant = "hero" }: PageHeaderProps) {
  const hero = variant === "hero";

  return (
    <Paper
      elevation={hero ? 1 : 0}
      sx={{
        p: { xs: 2, sm: 4 },
        borderRadius: hero ? 4 : 2,
        color: hero ? "common.white" : undefined,
        background: (theme) =>
          hero
            ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`
            : `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.082)}, ${alpha(theme.palette.primary.dark, 0.082)})`,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
      >
        <Stack spacing={1}>
          <Typography component="h1" sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: hero ? 800 : 700 }}>
            {title}
          </Typography>
          <Typography sx={hero ? { opacity: 0.9 } : { typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        </Stack>
        {action}
      </Stack>
    </Paper>
  );
}
