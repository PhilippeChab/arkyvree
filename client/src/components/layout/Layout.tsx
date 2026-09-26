import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import {
  campaignListQuery,
  characterListQuery,
  dashboardStatsQuery,
  rulesetListQuery,
} from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import {
  AccountCircle,
  ChevronLeft,
  ChevronRight,
  Dashboard as DashboardIcon,
  Favorite as SupportIcon,
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
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAttachment, useDemoTimeRemaining, useIsMobile } from "@/client/src/hooks/index.ts";
import { Onboarding } from "@/client/src/components/onboarding/index.ts";
import { AppBrand, AppMain } from "./AppShell.tsx";
import { DemoBanner } from "./DemoBanner.tsx";
import { FeedbackButton } from "./FeedbackButton.tsx";
import { NotificationBell } from "./NotificationBell.tsx";

const drawerWidth = 72;
const expandedDrawerWidth = 240;

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
    path: externalLinks.help,
    external: true,
  },
  {
    id: "changelog" as const,
    label: "Changelog",
    icon: <ChangelogIcon />,
    description: "What's new",
    path: externalLinks.changelog,
    external: true,
  },
  {
    id: "support" as const,
    label: "Support Arkyvree",
    icon: <SupportIcon />,
    description: "Buy me a coffee",
    path: externalLinks.support,
    external: true,
  },
];

const stepToSidebarId: Record<number, string> = { 1: "rulesets", 2: "characters", 3: "campaigns" };

// Warm the first page of a section when its sidebar item is hovered. The
// options are the ones the pages use, filtered the way a page opens by default.
const DEFAULT_LIST = { search: "", orderBy: "createdAt", orderDir: "desc" } as const;
const prefetchers: Partial<Record<string, (queryClient: QueryClient) => void>> = {
  dashboard: (queryClient) => void queryClient.prefetchQuery(dashboardStatsQuery()),
  rulesets: (queryClient) => void queryClient.prefetchInfiniteQuery(rulesetListQuery({ scope: undefined, ...DEFAULT_LIST })),
  characters: (queryClient) => void queryClient.prefetchInfiniteQuery(characterListQuery({ view: "active", ...DEFAULT_LIST })),
  campaigns: (queryClient) => void queryClient.prefetchInfiniteQuery(campaignListQuery({ view: "active", ...DEFAULT_LIST })),
};

export function Layout() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isMobile = useIsMobile();
  const theme = useTheme();

  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
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
  // Sidebar item elements live in state (not a ref) so the onboarding popover
  // can read its anchor during render, on the same render its step changes.
  const [sidebarItemEls, setSidebarItemEls] = useState<Record<string, HTMLElement | null>>({});
  const sidebarItemRefs = useMemo(
    () => Object.fromEntries(sidebarItems.map(({ id }) => [
      id,
      (el: HTMLElement | null) => setSidebarItemEls((prev) => (prev[id] === el ? prev : { ...prev, [id]: el })),
    ])),
    [],
  );

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
    updateUser({ onboardingCompletedAt: new Date().toISOString() });
    completeOnboarding();
  }, [completeOnboarding, updateUser]);

  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);
  const clearSession = useAuthStore((s) => s.clearSession);
  // First path segment, e.g. "rulesets" for /rulesets/123; highlights the matching sidebar item.
  const activeSection = location.pathname.split("/")[1];

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
            <IconButton color="inherit" onClick={() => setMobileDrawerOpen(true)} edge="start" aria-label="Open navigation">
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
            <AppBrand />
          </Typography>

          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, sm: 2 }, flexShrink: 0 }}>
            {!isDemo && <FeedbackButton />}
            {!isDemo && <NotificationBell />}
            {!isDemo && (
              <IconButton size="large" onClick={handleMenuOpen} color="inherit" aria-label="Account menu">
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
            flex: 1,
            minHeight: 0,
            position: "relative",
          }}
        >
          <List sx={{ flex: 1, pt: 2, px: 1 }}>
            {sidebarItems.map((item) => (
              <ListItem key={item.id} disablePadding sx={{ mb: 1 }}>
                <ListItemButton
                  ref={sidebarItemRefs[item.id]}
                  selected={!("external" in item) && activeSection === item.id}
                  onClick={() => {
                    if ("external" in item && item.external) {
                      window.open(item.path, "_blank", "noopener,noreferrer");
                    } else {
                      navigate(item.path);
                    }
                    if (isMobile) setMobileDrawerOpen(false);
                  }}
                  onMouseEnter={() => prefetchers[item.id]?.(queryClient)}
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
              aria-label={effectiveExpanded ? "Collapse sidebar" : "Expand sidebar"}
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
      <AppMain banner={isDemo && <DemoBanner />} railWidth={isMobile ? 0 : drawerWidth} />
      <Onboarding
        open={onboardingOpen}
        onClose={handleOnboardingClose}
        activeStep={onboardingStep}
        onStepChange={setOnboardingStep}
        anchorEl={onboardingHighlightId ? sidebarItemEls[onboardingHighlightId] ?? null : null}
        isMobile={isMobile}
      />
    </Box>
  );
}
