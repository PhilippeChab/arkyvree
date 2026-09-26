import { Box, Paper, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
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
        mb: hero ? 4 : 3,
        borderRadius: hero ? 4 : 2,
        color: hero ? "common.white" : undefined,
        background: (theme) => hero
          ? `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`
          : `linear-gradient(135deg, ${theme.palette.primary.main}15, ${theme.palette.primary.dark}15)`,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
      >
        <Box>
          <Typography
            component="h1"
            sx={{ typography: { xs: "h4", md: "h3" }, fontWeight: hero ? 800 : 700, mb: 1 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              sx={hero
                ? { typography: "body1", opacity: 0.9 }
                : { typography: { xs: "body1", sm: "h6" }, color: "text.secondary" }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
    </Paper>
  );
}
