import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { useAttachment } from "@/client/src/hooks/index.ts";
import {
  AccountCircle,
  ChevronLeft,
  ChevronRight,
  Dashboard as DashboardIcon,
  HelpOutlined as FaqIcon,
  History as HistoryIcon,
  RocketLaunch as ChangelogIcon,
  Notifications as NotificationsIcon,
  Logout,
  Map as MapIcon,
  Menu as MenuIcon,
  MenuBook as BookIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
} from "@mui/icons-material";
import { DiceSpinner } from "@/client/src/components/common/index.ts";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useDemoTimeRemaining, useIsMobile } from "@/client/src/hooks/index.ts";
import { Onboarding } from "@/client/src/components/onboarding/index.ts";
import { DemoBanner } from "./DemoBanner.tsx";
import { FeedbackButton } from "./FeedbackButton.tsx";
import { Footer } from "./Footer.tsx";
import { NotificationBell } from "./NotificationBell.tsx";

const drawerWidth = 72;
const expandedDrawerWidth = 240;

export type Section = "dashboard" | "rulesets" | "campaigns" | "characters" | "activities" | "notifications";

const FEATUREBASE_HELP_URL = "https://arkyvree.featurebase.app/help";
const FEATUREBASE_CHANGELOG_URL = "https://arkyvree.featurebase.app/changelog";

const sidebarItems = [
  {
    id: "dashboard" as const,
    label: "Dashboard",
    icon: <DashboardIcon />,
    description: "Overview and statistics",
    path: "/dashboard",
  },
  {
    id: "rulesets" as const,
    label: "Rulesets",
    icon: <BookIcon />,
    description: "Browse available rulesets",
    path: "/rulesets",
  },
  {
    id: "characters" as const,
    label: "Characters",
    icon: <PersonIcon />,
    description: "View your characters",
    path: "/characters",
  },
  {
    id: "campaigns" as const,
    label: "Campaigns",
    icon: <MapIcon />,
    description: "Manage your campaigns",
    path: "/campaigns",
  },
  {
    id: "notifications" as const,
    label: "Notifications",
    icon: <NotificationsIcon />,
    description: "Updates from collaborators",
    path: "/notifications",
  },
  {
    id: "faq" as const,
    label: "Help",
    icon: <FaqIcon />,
    description: "Help center",
    path: FEATUREBASE_HELP_URL,
    external: true,
  },
  {
    id: "changelog" as const,
    label: "Changelog",
    icon: <ChangelogIcon />,
    description: "What's new",
    path: FEATUREBASE_CHANGELOG_URL,
    external: true,
  },
];

const stepToSidebarId: Record<number, string> = { 1: "rulesets", 2: "characters", 3: "campaigns" };

export function Layout() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const theme = useTheme();

  const user = useAuthStore((s) => s.user);
  const { data: avatarAttachment } = useAttachment({
    recordType: "User",
    recordId: user?.id,
    name: "avatar",
  });
  const { isDemo } = useDemoTimeRemaining();
  // Suppress the onboarding popovers for demo users — they already see a
  // dedicated demo banner and the popover would just stack on top.
  const [onboardingOpen, setOnboardingOpen] = useState(() => !isDemo && !user?.onboardingCompletedAt);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const sidebarItemRefs = useRef<Record<string, HTMLElement | null>>({});

  const isPopoverStep = onboardingOpen && !isMobile && stepToSidebarId[onboardingStep];
  const onboardingHighlightId = isPopoverStep ? stepToSidebarId[onboardingStep] : null;
  const effectiveExpanded = sidebarExpanded || !!isPopoverStep;

  const darkMode = theme.palette.mode === "dark";
  const gold = darkMode ? "#f5c542" : "#bf9000";
  const goldFaint = darkMode ? "rgba(245, 197, 66, 0.25)" : "rgba(191, 144, 0, 0.20)";

  const { mutate: completeOnboarding } = useMutation({
    mutationFn: () => rpc.auth["complete-onboarding"].$post(),
  });

  const handleOnboardingClose = useCallback(() => {
    setOnboardingOpen(false);
    useAuthStore.setState((s) => ({
      user: s.user ? { ...s.user, onboardingCompletedAt: new Date().toISOString() } : null,
    }));
    completeOnboarding();
  }, [completeOnboarding]);

  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el || el.scrollTop === 0) return;

    const start = el.scrollTop;
    const startTime = performance.now();
    const duration = 250;
    let frame: number;

    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      el!.scrollTop = start * (1 - (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  const queryClient = useQueryClient();
  const { signOut, clearSession } = useAuthStore();

  const prefetchSection = useCallback((sectionId: Section) => {
    switch (sectionId) {
      case "dashboard":
        queryClient.prefetchQuery({
          queryKey: queryKeys.dashboard.stats,
          queryFn: async () => {
            const response = await rpc.api.dashboard.stats.$get();
            if (!response.ok) throw new Error("Failed to fetch dashboard stats");
            return response.json();
          },
        });
        break;
      case "campaigns":
        queryClient.prefetchInfiniteQuery({
          queryKey: queryKeys.campaigns.list({ view: "active", search: "", orderBy: "createdAt", orderDir: "desc" }),
          queryFn: async () => {
            const response = await rpc.api.campaigns.$get({
              query: { page: "1", limit: "10", visibility: "active", orderBy: "createdAt", orderDir: "desc" },
            });
            if (!response.ok) throw new Error("Failed to fetch campaigns");
            return response.json();
          },
          initialPageParam: 1,
        });
        break;
      case "characters":
        queryClient.prefetchInfiniteQuery({
          queryKey: queryKeys.characters.list({ view: "active", search: "", orderBy: "createdAt", orderDir: "desc" }),
          queryFn: async () => {
            const response = await rpc.api.characters.$get({
              query: { page: "1", limit: "10", visibility: "active", orderBy: "createdAt", orderDir: "desc" },
            });
            if (!response.ok) throw new Error("Failed to fetch characters");
            return response.json();
          },
          initialPageParam: 1,
        });
        break;
      case "rulesets":
        queryClient.prefetchInfiniteQuery({
          queryKey: queryKeys.rulesets.list({ scope: undefined, search: "", orderBy: "createdAt", orderDir: "desc" }),
          queryFn: async () => {
            const response = await rpc.api.rulesets.$get({
              query: { page: "1", limit: "10", orderBy: "createdAt", orderDir: "desc" },
            });
            if (!response.ok) throw new Error("Failed to fetch rulesets");
            return response.json();
          },
          initialPageParam: 1,
        });
        break;
      case "activities":
        queryClient.prefetchInfiniteQuery({
          queryKey: queryKeys.activities.list({ search: "", orderBy: "createdAt", orderDir: "desc" }),
          queryFn: async () => {
            const response = await rpc.api.activities.$get({
              query: { page: "1", limit: "20", orderBy: "createdAt", orderDir: "desc" },
            });
            if (!response.ok) throw new Error("Failed to fetch activities");
            return response.json();
          },
          initialPageParam: 1,
        });
        break;
    }
  }, [queryClient]);

  // Get active section from current path
  const getActiveSection = (): Section => {
    const path = location.pathname.slice(1); // Remove leading slash
    const basePath = path.split("/")[0]; // Get first segment (e.g., "rulesets" from "rulesets/123")

    if (
      ["dashboard", "characters", "campaigns", "rulesets", "activities", "notifications"].includes(basePath)
    ) {
      return basePath as Section;
    }
    return "dashboard";
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSignOut = async () => {
    handleMenuClose();
    queryClient.cancelQueries();
    try {
      await signOut();
    } catch {
      clearSession();
    }
    queryClient.clear();
    navigate("/sign-in");
  };

  const handleProfile = () => {
    handleMenuClose();
    navigate("/profile");
  };

  const handleSettings = () => {
    handleMenuClose();
    navigate("/settings");
  };

  return (
    <Box sx={{ display: "flex" }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
        }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileDrawerOpen(true)} edge="start">
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ width: drawerWidth }} />
          )}

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={isMobile ? {
              flex: 1,
              textAlign: "center",
              fontWeight: 700,
            } : {
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              fontWeight: 700,
            }}
          >
            <img src="/pwa-192x192.png" alt="" style={{ width: 28, height: 28, marginRight: 8, verticalAlign: "middle" }} />
            Arkyvree
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 2 }, flexShrink: 0 }}>
            {!isDemo && <FeedbackButton />}
            {!isDemo && <NotificationBell />}
            {!isDemo && (
              <IconButton size="large" onClick={handleMenuOpen} color="inherit">
                <Avatar src={avatarAttachment?.url ?? undefined} sx={{ width: 32, height: 32 }}>
                  <AccountCircle />
                </Avatar>
              </IconButton>
            )}
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem onClick={handleProfile}>
              <ListItemIcon>
                <AccountCircle fontSize="small" />
              </ListItemIcon>
              Profile
            </MenuItem>
            <MenuItem onClick={() => { handleMenuClose(); navigate("/activities"); }}>
              <ListItemIcon>
                <HistoryIcon fontSize="small" />
              </ListItemIcon>
              Activity
            </MenuItem>
            <MenuItem onClick={handleSettings}>
              <ListItemIcon>
                <SettingsIcon fontSize="small" />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleSignOut}>
              <ListItemIcon>
                <Logout fontSize="small" />
              </ListItemIcon>
              Sign Out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      {/* Sidebar */}
      <Drawer
        sx={{
          width: isMobile ? expandedDrawerWidth : (effectiveExpanded ? expandedDrawerWidth : drawerWidth),
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: isMobile ? expandedDrawerWidth : (effectiveExpanded ? expandedDrawerWidth : drawerWidth),
            boxSizing: "border-box",
            borderRight: "none",
            transition: "all 0.35s cubic-bezier(0.2, 0, 0, 1)",
            overflow: "hidden",
            bgcolor: (theme) => theme.palette.mode === "dark" ? "background.paper" : "grey.50",
            boxShadow: (theme) =>
              theme.palette.mode === "dark"
                ? "2px 0 8px rgba(0,0,0,0.3)"
                : "2px 0 8px rgba(0,0,0,0.08)",
          },
        }}
        variant={isMobile ? "temporary" : "permanent"}
        anchor="left"
        open={isMobile ? mobileDrawerOpen : true}
        onClose={() => setMobileDrawerOpen(false)}
      >
        <Toolbar />
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "calc(100% - 64px)",
            position: "relative",
          }}
        >
          <List sx={{ flex: 1, pt: 2, px: 1 }}>
            {sidebarItems.map((item) => (
              <ListItem key={item.id} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  ref={(el) => { sidebarItemRefs.current[item.id] = el; }}
                  selected={!("external" in item) && getActiveSection() === item.id}
                  onClick={() => {
                    if ("external" in item && item.external) {
                      window.open(item.path, "_blank", "noopener,noreferrer");
                    } else {
                      navigate(item.path);
                    }
                    if (isMobile) setMobileDrawerOpen(false);
                  }}
                  onMouseEnter={() => { if (!("external" in item)) prefetchSection(item.id as Section); }}
                  sx={{
                    height: 48,
                    minHeight: "unset",
                    ...(onboardingHighlightId === item.id && {
                      boxShadow: `0 0 0 2px ${gold}, 0 0 12px ${goldFaint}`,
                    }),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: (isMobile || effectiveExpanded) ? "flex-start" : "center",
                    px: (isMobile || effectiveExpanded) ? 2 : 1.5,
                    py: 1,
                    borderRadius: 3,
                    mx: 0.5,
                    position: "relative",
                    overflow: "hidden",
                    transition: "all 0.25s cubic-bezier(0.2, 0, 0, 1)",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: "linear-gradient(135deg, transparent, rgba(255,255,255,0.1))",
                      opacity: 0,
                      transition: "opacity 0.25s ease",
                    },
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "white",
                      boxShadow: (theme) => `0 4px 12px ${theme.palette.primary.main}40`,
                      "&::before": {
                        opacity: 1,
                      },
                      "&::after": {
                        content: '""',
                        position: "absolute",
                        left: 0,
                        top: 4,
                        bottom: 4,
                        width: 3,
                        borderRadius: 2,
                        backgroundColor: "secondary.main",
                      },
                      "&:hover": {
                        backgroundColor: "primary.dark",
                      },
                      "& .MuiListItemIcon-root": {
                        color: "white",
                      },
                      "& .MuiListItemText-primary": {
                        fontWeight: 600,
                        color: "white",
                      },
                      "& .MuiListItemText-secondary": {
                        color: "rgba(255,255,255,0.8)",
                      },
                    },
                    "&:hover": {
                      backgroundColor: (theme) =>
                        theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.04)",
                      transform: "translateX(2px)",
                    },
                    "& .MuiListItemIcon-root": {
                      color: (theme) => theme.palette.mode === "dark" ? "grey.400" : "grey.700",
                    },
                    "& .MuiListItemText-primary": {
                      color: (theme) => theme.palette.mode === "dark" ? "grey.100" : "grey.900",
                    },
                    "& .MuiListItemText-secondary": {
                      color: (theme) => theme.palette.mode === "dark" ? "grey.500" : "grey.600",
                    },
                  }}
                  title={!(isMobile || effectiveExpanded) ? item.label : undefined}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      justifyContent: "center",
                      mr: (isMobile || effectiveExpanded) ? 2 : 0,
                      transition: "all 0.35s cubic-bezier(0.2, 0, 0, 1)",
                      "& .MuiSvgIcon-root": {
                        fontSize: "1.4rem",
                        transition: "transform 0.25s ease",
                      },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={(isMobile || effectiveExpanded) ? item.description : null}
                    sx={{
                      opacity: (isMobile || effectiveExpanded) ? 1 : 0,
                      transform: (isMobile || effectiveExpanded) ? "translateX(0)" : "translateX(-10px)",
                      transition: "all 0.35s cubic-bezier(0.2, 0, 0, 1)",
                      transitionDelay: (isMobile || effectiveExpanded) ? "0.05s" : "0s",
                    }}
                    slotProps={{
                      primary: {
                        sx: { fontSize: "0.95rem", whiteSpace: "nowrap" },
                      },
                      secondary: {
                        sx: { fontSize: "0.75rem", whiteSpace: "nowrap" },
                      },
                    }} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          {/* Toggle button at the bottom — hidden on mobile and during popover steps */}
          {!isMobile && !isPopoverStep && (
          <Box
            sx={{
              p: 2,
              pt: 3,
              display: "flex",
              justifyContent: "center",
              borderTop: "1px solid",
              borderColor: "divider",
              bgcolor: (theme) =>
                theme.palette.mode === "dark" ? "background.default" : "background.paper",
            }}
          >
            <IconButton
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              sx={{
                color: (theme) => theme.palette.mode === "dark" ? "grey.400" : "grey.700",
                backgroundColor: (theme) =>
                  theme.palette.mode === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                border: "2px solid",
                borderColor: (theme) =>
                  theme.palette.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
                transition: "all 0.25s cubic-bezier(0.2, 0, 0, 1)",
                "&:hover": {
                  backgroundColor: (theme) =>
                    theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
                  borderColor: "primary.main",
                  color: "primary.main",
                  transform: "scale(1.1)",
                },
              }}
              size="small"
            >
              {effectiveExpanded
                ? <ChevronLeft sx={{ transition: "transform 0.25s ease" }} />
                : <ChevronRight sx={{ transition: "transform 0.25s ease" }} />}
            </IconButton>
          </Box>
          )}
        </Box>
      </Drawer>
      {/* Main Content */}
      <Box
        ref={mainRef}
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
        {isDemo && <DemoBanner />}
        <Box sx={{ width: "100%", maxWidth: "1200px", px: { xs: 2, md: 3 }, flex: 1 }}>
          <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><DiceSpinner /></Box>}>
            <Outlet />
          </Suspense>
        </Box>
        <Footer />
      </Box>
      <Onboarding
        open={onboardingOpen}
        onClose={handleOnboardingClose}
        activeStep={onboardingStep}
        onStepChange={setOnboardingStep}
        anchorEl={onboardingHighlightId ? sidebarItemRefs.current[onboardingHighlightId] ?? null : null}
        isMobile={isMobile}
      />
    </Box>
  );
}
