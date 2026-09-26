import { GoldDivider, PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import { dashboardStatsQuery } from "@/client/src/lib/queries.ts";
import { RecentNotificationsCard } from "@/client/src/pages/dashboard/components/index.ts";
import {
  HelpOutlined as FaqIcon,
  Map as MapIcon,
  MenuBook as RulesetIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import { Alert, Box, Card, CardActionArea, CardContent, Container, Link, Paper, type Theme, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { ElementType } from "react";
import { useNavigate } from "react-router-dom";

const textShadow = "0px 2px 4px rgba(0,0,0,0.3)";

interface StatCardProps {
  icon: ElementType;
  count: number;
  label: string;
  tagline: string;
  onClick: () => void;
  /** Gradient start and end, from the theme palette. */
  colors: (theme: Theme) => [string, string];
  animationIndex: number;
}

function StatCard({ icon: Icon, count, label, tagline, onClick, colors, animationIndex }: StatCardProps) {
  return (
    <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
      <Card
        sx={{
          height: "100%",
          background: (theme) => {
            const [from, to] = colors(theme);
            return `linear-gradient(135deg, ${from}80 0%, ${to} 100%)`;
          },
          color: "common.white",
          border: (theme) => `1px solid ${colors(theme)[1]}60`,
          transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
          "&:hover": {
            transform: "translateY(-8px)",
            boxShadow: (theme) => `0px 8px 24px ${colors(theme)[1]}60`,
          },
          ...fadeInUpSx(animationIndex),
        }}
      >
        <CardActionArea onClick={onClick} sx={{ height: "100%" }}>
          <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 4 } }}>
            <Icon sx={{ fontSize: { xs: 48, sm: 60 }, mb: 2 }} />
            <Typography sx={{ typography: { xs: "h4", md: "h2" }, fontWeight: 800, mb: 1, textShadow }}>
              {count}
            </Typography>
            <Typography component="h2" variant="h6" sx={{ textShadow }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 1, textShadow }}>
              {tagline}
            </Typography>
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
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          Failed to load dashboard statistics. Please try again later.
        </Alert>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        {/* Hero Section */}
        <Paper
          sx={{
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
            color: "white",
            p: { xs: 3, sm: 4 },
            borderRadius: 4,
            mb: 4,
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
              background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 60%)",
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
              borderTop: "2px solid rgba(255,255,255,0.3)",
              borderLeft: "2px solid rgba(255,255,255,0.3)",
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
              borderBottom: "2px solid rgba(255,255,255,0.3)",
              borderRight: "2px solid rgba(255,255,255,0.3)",
              borderBottomRightRadius: 4,
              pointerEvents: "none",
            }}
          />

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2, position: "relative" }}>
            {/* Icon with radial glow */}
            <Box
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
                  background: "radial-gradient(circle, rgba(245, 197, 66, 0.15) 0%, transparent 70%)",
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
                  filter: "drop-shadow(0 4px 12px rgba(191, 144, 0, 0.35))",
                }}
              />
            </Box>
            <Typography
              component="h1"
              sx={{
                typography: { xs: "h4", md: "h2" },
                fontWeight: 800,
                textShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              Welcome to Arkyvree
            </Typography>
          </Box>
          <Typography
            sx={{
              opacity: 0.9,
              mb: 3,
              typography: { xs: "body1", sm: "h5" },
              textShadow: "0 1px 4px rgba(0,0,0,0.2)",
              position: "relative",
            }}
          >
            Your programmable ruleset engine. Build characters, manage campaigns.
          </Typography>
          <Link
            href={externalLinks.help}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              color: "rgba(255,255,255,0.8)",
              textDecorationColor: "rgba(255,255,255,0.4)",
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              fontSize: "0.875rem",
              position: "relative",
              "&:hover": { color: "white" },
            }}
          >
            <FaqIcon sx={{ fontSize: 18 }} />
            Help
          </Link>
        </Paper>

        <GoldDivider />

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mb: 4 }}>
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
        </Box>

        <GoldDivider />

        <RecentNotificationsCard />
      </Container>
    </PageTransition>
  );
}
