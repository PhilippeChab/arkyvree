import {
  alpha,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Container,
  Link as MuiLink,
  Paper,
  Stack,
  type Theme,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ElementType } from "react";
import { useNavigate } from "react-router-dom";

import { DiceSpinner, GoldDivider, LoadError, PageTransition } from "@/client/src/components/common/index.ts";
import { FaqIcon, MapIcon, PersonIcon, RulesetIcon } from "@/client/src/components/icons/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import { dashboardStatsQuery } from "@/client/src/lib/queries.ts";
import { DURATION, EASING, fadeInUpSx, PREFERS_REDUCED_MOTION, transitionOf } from "@/client/src/theme/animations.ts";

import { RecentNotificationsCard } from "./components/index.ts";

interface StatCardProps {
  animationIndex: number;
  /** Gradient start and end, from the theme palette. */
  colors: (theme: Theme) => [string, string];
  count: number;
  icon: ElementType;
  label: string;
  onClick: () => void;
  tagline: string;
}

function StatCard({ icon: Icon, count, label, tagline, onClick, colors, animationIndex }: StatCardProps) {
  return (
    <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
      <Card
        sx={[
          {
            height: "100%",
            background: (theme) => {
              const [from, to] = colors(theme);
              return `linear-gradient(135deg, ${alpha(from, 0.502)} 0%, ${to} 100%)`;
            },
            color: "common.white",
            border: 1,
            borderColor: (theme) => alpha(colors(theme)[1], 0.376),
            transition: transitionOf(["transform", "box-shadow"], DURATION.brisk, EASING.easeInOut),
            "&:hover": {
              transform: "translateY(-8px)",
              boxShadow: (theme) => theme.boxShadows.glow(colors(theme)[1]),
            },
            [PREFERS_REDUCED_MOTION]: { "&:hover": { transform: "none" } },
          },
          fadeInUpSx(animationIndex),
        ]}
      >
        <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
          <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 4 } }}>
            <Stack spacing={2}>
              <Box>
                <Icon sx={{ fontSize: { xs: 48, sm: 60 } }} />
              </Box>
              <Stack spacing={1}>
                <Typography
                  component="p"
                  sx={{
                    typography: { xs: "h4", md: "h2" },
                    fontWeight: 800,
                    textShadow: (theme) => theme.textShadows.stat,
                  }}
                >
                  {count}
                </Typography>
                <Typography component="h2" variant="h6" sx={{ textShadow: (theme) => theme.textShadows.stat }}>
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, textShadow: (theme) => theme.textShadows.stat }}>
                  {tagline}
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </CardActionArea>
      </Card>
    </Box>
  );
}

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const navigate = useNavigate();

  const { data: dashboardStats, isLoading, error } = useQuery(dashboardStatsQuery());

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DiceSpinner size="large" sx={{ minHeight: "80vh" }} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <LoadError what="Dashboard statistics" error={error} sx={{ borderRadius: 3 }} />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Stack spacing={4}>
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
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} sx={{ alignItems: "center", position: "relative" }}>
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
                      background: (theme) =>
                        `radial-gradient(circle, ${alpha(theme.palette.gold.light, 0.15)} 0%, transparent 70%)`,
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
                      filter: (theme) => theme.dropShadows.heroLogo,
                    }}
                  />
                </Stack>
                <Typography
                  component="h1"
                  sx={{
                    typography: { xs: "h4", md: "h2" },
                    fontWeight: 800,
                    textShadow: (theme) => theme.textShadows.hero,
                  }}
                >
                  Welcome to Arkyvree
                </Typography>
              </Stack>
              <Stack spacing={3}>
                <Typography
                  component="p"
                  sx={{
                    opacity: 0.9,
                    typography: { xs: "body1", sm: "h5" },
                    textShadow: (theme) => theme.textShadows.heroTagline,
                    position: "relative",
                  }}
                >
                  Your programmable ruleset engine. Build characters, manage campaigns.
                </Typography>
                {/* In a line of its own, as an inline link is */}
                <Box>
                  <Stack
                    component={MuiLink}
                    direction="row"
                    spacing={0.5}
                    href={EXTERNAL_LINKS.help}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      color: (theme) => alpha(theme.palette.common.white, 0.8),
                      textDecorationColor: (theme) => alpha(theme.palette.common.white, 0.4),
                      display: "inline-flex",
                      alignItems: "center",
                      fontSize: "0.875rem",
                      position: "relative",
                      "&:hover": { color: "common.white" },
                    }}
                  >
                    <FaqIcon sx={{ fontSize: 18 }} />
                    Help
                  </Stack>
                </Box>
              </Stack>
            </Stack>
          </Paper>

          <Stack spacing={3}>
            <GoldDivider />

            <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap" }}>
              <StatCard
                icon={PersonIcon}
                count={dashboardStats?.totalCharacters ?? 0}
                label="Characters"
                tagline="Heroes ready for adventure"
                onClick={() => navigate("/characters")}
                colors={(theme) => [theme.palette.primary.light, theme.palette.primary.main]}
                animationIndex={0}
              />
              <StatCard
                icon={MapIcon}
                count={dashboardStats?.totalCampaigns ?? 0}
                label="Campaigns"
                tagline="Epic quests in progress"
                onClick={() => navigate("/campaigns")}
                colors={(theme) => [theme.palette.secondary.light, theme.palette.secondary.main]}
                animationIndex={1}
              />
              <StatCard
                icon={RulesetIcon}
                count={dashboardStats?.totalRulesets ?? 0}
                label="Rulesets"
                tagline="Game systems available"
                onClick={() => navigate("/rulesets")}
                colors={(theme) => [theme.palette.primary.dark, theme.palette.primary.dark]}
                animationIndex={2}
              />
            </Stack>
          </Stack>

          <Stack spacing={3}>
            <GoldDivider />

            <RecentNotificationsCard />
          </Stack>
        </Stack>
      </Container>
    </PageTransition>
  );
}
