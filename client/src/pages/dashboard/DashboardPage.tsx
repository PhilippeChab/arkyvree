import {
  alpha,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Link as MuiLink,
  Paper,
  Stack,
  type Theme,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ElementType } from "react";
import { Link } from "react-router-dom";

import { DiceSpinner, GoldDivider, LoadError, PageBody } from "@/client/src/components/common/index.ts";
import { CampaignsIcon, CharactersIcon, HelpIcon, RulesetsIcon } from "@/client/src/components/icons/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { DURATION, fadeInUpSx, transitionOf } from "@/client/src/lib/animations.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { dashboardStatsQuery } from "@/client/src/lib/queries.ts";
import { RecentNotificationsCard } from "@/client/src/pages/dashboard/components/index.ts";
import { brandGold, brandGoldTint } from "@/client/src/theme/brandGold.ts";
import { glow, iconGlow, textLift } from "@/client/src/theme/shadows.ts";

interface StatCardProps {
  icon: ElementType;
  count: number;
  label: string;
  tagline: string;
  /** The page the card opens */
  to: string;
  /** Gradient start and end, from the theme palette. */
  colors: (theme: Theme) => [string, string];
  animationIndex: number;
}

function StatCard({ icon: Icon, count, label, tagline, to, colors, animationIndex }: StatCardProps) {
  return (
    <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
      <Card
        sx={{
          height: "100%",
          background: (theme) => {
            const [from, to] = colors(theme);
            return `linear-gradient(135deg, ${alpha(from, 0.5)} 0%, ${to} 100%)`;
          },
          color: "common.white",
          borderColor: (theme) => alpha(colors(theme)[1], 0.38),
          transition: transitionOf(["transform", "box-shadow"], DURATION.fast),
          "&:hover": {
            transform: "translateY(-8px)",
            boxShadow: (theme) => glow(colors(theme)[1]),
          },
          ...fadeInUpSx(animationIndex),
        }}
      >
        <CardActionArea component={Link} to={to} sx={{ height: "100%" }}>
          <CardContent sx={{ p: { xs: 2, sm: 4 } }}>
            <Stack spacing={1} sx={{ alignItems: "center", textAlign: "center" }}>
              <Icon fontSize="hero" />
              <Typography
                component="p"
                sx={{ typography: { xs: "h4", md: "h2" }, fontWeight: "fontWeightBold", textShadow: textLift }}
              >
                {count}
              </Typography>
              <Typography component="h2" variant="h5" sx={{ textShadow: textLift }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, textShadow: textLift }}>
                {tagline}
              </Typography>
            </Stack>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard");

  const { data: dashboardStats, isLoading, error } = useQuery(dashboardStatsQuery());

  if (isLoading) {
    return (
      <PageBody>
        <DiceSpinner size="large" sx={{ minHeight: "80vh" }} />
      </PageBody>
    );
  }

  if (error) {
    return (
      <PageBody>
        <LoadError what="Dashboard statistics" error={error} sx={{ borderRadius: 3 }} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      {/* Hero Section */}
      <Paper
        sx={{
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
          color: "common.white",
          p: { xs: 3, sm: 4 },
          borderRadius: 4,
          overflow: "hidden",
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "120%",
            height: "120%",
            background: (theme) =>
              `radial-gradient(circle, ${alpha(theme.palette.common.white, 0.08)} 0%, transparent 60%)`,
            pointerEvents: "none",
          },
        }}
      >
        {/* Corner filigree top-left */}
        <Box
          sx={{
            display: { xs: "none", sm: "block" },
            position: "absolute",
            top: 16,
            left: 16,
            width: 40,
            height: 40,
            borderTop: 2,
            borderLeft: 2,
            borderColor: (theme) => alpha(theme.palette.common.white, 0.3),
            borderTopLeftRadius: 4,
            pointerEvents: "none",
          }}
        />
        {/* Corner filigree bottom-right */}
        <Box
          sx={{
            display: { xs: "none", sm: "block" },
            position: "absolute",
            bottom: 16,
            right: 16,
            width: 40,
            height: 40,
            borderBottom: 2,
            borderRight: 2,
            borderColor: (theme) => alpha(theme.palette.common.white, 0.3),
            borderBottomRightRadius: 4,
            pointerEvents: "none",
          }}
        />

        <Stack spacing={2} sx={{ alignItems: "flex-start", position: "relative" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {/* Icon with radial glow */}
            <Stack
              direction="row"
              sx={{
                position: "relative",
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  width: 120,
                  height: 120,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${brandGoldTint(true, 0.15)} 0%, transparent 70%)`,
                  pointerEvents: "none",
                }}
              />
              <Box
                component="img"
                src="/pwa-512x512.png"
                alt=""
                sx={{
                  width: { sm: 48, md: 64 },
                  height: { sm: 48, md: 64 },
                  position: "relative",
                  filter: iconGlow(brandGold(false)),
                }}
              />
            </Stack>
            <Typography component="h1" variant="h3" sx={{ textShadow: textLift }}>
              Welcome to Arkyvree
            </Typography>
          </Stack>
          <Typography
            component="p"
            sx={{
              opacity: 0.9,
              typography: { xs: "body1", sm: "h5" },
              textShadow: textLift,
              position: "relative",
            }}
          >
            Your programmable ruleset engine. Build characters, manage campaigns.
          </Typography>
          <MuiLink
            href={externalLinks.help}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: (theme) => alpha(theme.palette.common.white, 0.8),
              textDecorationColor: (theme) => alpha(theme.palette.common.white, 0.4),
              typography: "body2",
              position: "relative",
              "&:hover": { color: "common.white" },
            }}
          >
            <HelpIcon fontSize="compact" sx={{ verticalAlign: "middle" }} /> Help
          </MuiLink>
        </Stack>
      </Paper>

      <GoldDivider />

      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
        <StatCard
          icon={CharactersIcon}
          count={dashboardStats?.totalCharacters ?? 0}
          label="Characters"
          tagline="Heroes ready for adventure"
          to="/characters"
          colors={(theme) => [theme.palette.primary.light, theme.palette.primary.main]}
          animationIndex={0}
        />
        <StatCard
          icon={CampaignsIcon}
          count={dashboardStats?.totalCampaigns ?? 0}
          label="Campaigns"
          tagline="Epic quests in progress"
          to="/campaigns"
          colors={(theme) => [theme.palette.secondary.light, theme.palette.secondary.main]}
          animationIndex={1}
        />
        <StatCard
          icon={RulesetsIcon}
          count={dashboardStats?.totalRulesets ?? 0}
          label="Rulesets"
          tagline="Game systems available"
          to="/rulesets"
          colors={(theme) => [theme.palette.primary.dark, theme.palette.primary.dark]}
          animationIndex={2}
        />
      </Stack>

      <GoldDivider />

      <RecentNotificationsCard />
    </PageBody>
  );
}
