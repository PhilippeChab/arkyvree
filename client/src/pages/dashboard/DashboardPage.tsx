import { GoldDivider, PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { fadeInUpSx } from "@/client/src/lib/animations.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { RecentNotificationsCard } from "@/client/src/pages/dashboard/components/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  HelpOutlined as FaqIcon,
  Map as MapIcon,
  MenuBook as RulesetIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import { Alert, Box, Card, CardContent, Container, Link, Paper, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  usePageTitle("Dashboard");
  const navigate = useNavigate();

  const {
    data: dashboardStats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const response = await rpc.api.dashboard.stats.$get();

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }

      return response.json();
    },
  });

  if (statsLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "80vh",
          }}
        >
          <DiceSpinner size="large" />
        </Box>
      </Container>
    );
  }

  if (statsError) {
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
          href="https://arkyvree.featurebase.app/help"
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

      {/* Stats Cards */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mb: 4 }}>
        <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
          <Card
            onClick={() => navigate("/characters")}
            sx={{
              height: "100%",
              cursor: "pointer",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.light}80 0%, ${theme.palette.primary.main} 100%)`,
              color: "white",
              border: (theme) => `1px solid ${theme.palette.primary.main}60`,
              transition:
                "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
              "&:hover": {
                transform: "translateY(-8px)",
                boxShadow: (theme) =>
                  `0px 8px 24px ${theme.palette.primary.main}60`,
              },
              ...fadeInUpSx(0),
            }}
          >
            <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 4 } }}>
              <PersonIcon
                sx={{
                  fontSize: { xs: 48, sm: 60 },
                  mb: 2,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              />
              <Typography
                sx={{
                  typography: { xs: "h4", md: "h2" },
                  fontWeight: 800,
                  mb: 1,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                {dashboardStats?.totalCharacters || 0}
              </Typography>
              <Typography
                variant="h6"
                sx={{ textShadow: "0px 1px 2px rgba(0,0,0,0.3)" }}
              >
                Characters
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  opacity: 0.9,
                  mt: 1,
                  textShadow: "0px 1px 2px rgba(0,0,0,0.3)",
                }}
              >
                Heroes ready for adventure
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
          <Card
            onClick={() => navigate("/campaigns")}
            sx={{
              height: "100%",
              cursor: "pointer",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.secondary.light}80 0%, ${theme.palette.secondary.main} 100%)`,
              color: "white",
              border: (theme) => `1px solid ${theme.palette.secondary.main}60`,
              transition:
                "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
              "&:hover": {
                transform: "translateY(-8px)",
                boxShadow: (theme) =>
                  `0px 8px 24px ${theme.palette.secondary.main}60`,
              },
              ...fadeInUpSx(1),
            }}
          >
            <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 4 } }}>
              <MapIcon
                sx={{
                  fontSize: { xs: 48, sm: 60 },
                  mb: 2,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              />
              <Typography
                sx={{
                  typography: { xs: "h4", md: "h2" },
                  fontWeight: 800,
                  mb: 1,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                {dashboardStats?.totalCampaigns || 0}
              </Typography>
              <Typography
                variant="h6"
                sx={{ textShadow: "0px 1px 2px rgba(0,0,0,0.3)" }}
              >
                Campaigns
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  opacity: 0.9,
                  mt: 1,
                  textShadow: "0px 1px 2px rgba(0,0,0,0.3)",
                }}
              >
                Epic quests in progress
              </Typography>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ flex: "1 1 300px", minWidth: { xs: 0, sm: 300 } }}>
          <Card
            onClick={() => navigate("/rulesets")}
            sx={{
              height: "100%",
              cursor: "pointer",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.dark}80 0%, #5d1313 100%)`,
              color: "white",
              border: (theme) => `1px solid ${theme.palette.primary.dark}60`,
              transition:
                "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
              "&:hover": {
                transform: "translateY(-8px)",
                boxShadow: (theme) =>
                  `0px 8px 24px ${theme.palette.primary.dark}60`,
              },
              ...fadeInUpSx(2),
            }}
          >
            <CardContent sx={{ textAlign: "center", p: { xs: 2, sm: 4 } }}>
              <RulesetIcon
                sx={{
                  fontSize: { xs: 48, sm: 60 },
                  mb: 2,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              />
              <Typography
                sx={{
                  typography: { xs: "h4", md: "h2" },
                  fontWeight: 800,
                  mb: 1,
                  textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
                }}
              >
                {dashboardStats?.totalRulesets || 0}
              </Typography>
              <Typography
                variant="h6"
                sx={{ textShadow: "0px 1px 2px rgba(0,0,0,0.3)" }}
              >
                Rulesets
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  opacity: 0.9,
                  mt: 1,
                  textShadow: "0px 1px 2px rgba(0,0,0,0.3)",
                }}
              >
                Game systems available
              </Typography>
            </CardContent>
          </Card>
        </Box>
      </Box>

      <GoldDivider />

      {/* Recent Notifications */}
      <RecentNotificationsCard />
    </Container>
    </PageTransition>
  );
}
