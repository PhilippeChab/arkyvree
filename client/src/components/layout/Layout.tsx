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
  Stack,
  Toolbar,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ActionMenuItem } from "@/client/src/components/common/index.ts";
import {
  AccountIcon,
  ActivityIcon,
  CampaignsIcon,
  ChangelogIcon,
  CharactersIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  HelpIcon,
  MenuIcon,
  NotificationsIcon,
  RulesetsIcon,
  SettingsIcon,
  SignOutIcon,
  SupportIcon,
} from "@/client/src/components/icons/index.ts";
import { Onboarding } from "@/client/src/components/onboarding/index.ts";
import { useAttachment, useAuthRequests, useDemoTimeRemaining, useIsMobile } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, transitionOf } from "@/client/src/lib/animations.ts";
import { externalLinks } from "@/client/src/lib/externalLinks.ts";
import {
  campaignListQuery,
  characterListQuery,
  dashboardStatsQuery,
  rulesetListQuery,
} from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { brandGold, brandGoldTint } from "@/client/src/theme/brandGold.ts";

import { AppBrand, AppMain } from "./AppShell.tsx";
import { DemoBanner } from "./DemoBanner.tsx";
import { FeedbackButton } from "./FeedbackButton.tsx";
import { NotificationBell } from "./NotificationBell.tsx";

/** How a list page opens by default, which a prefetch asks for. */
const DEFAULT_LIST = { search: "", orderBy: "createdAt", orderDir: "desc" } as const;
const drawerWidth = 72;

const expandedDrawerWidth = 240;

/**
 * Warm the first page of a section when its sidebar item is hovered. The options are the ones the pages use, filtered
 * the way a page opens by default.
 */
const prefetchers: Partial<Record<string, (queryClient: QueryClient) => void>> = {
  dashboard: (queryClient) => void queryClient.prefetchQuery(dashboardStatsQuery()),
  rulesets: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(rulesetListQuery({ scope: undefined, ...DEFAULT_LIST })),
  characters: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(characterListQuery({ view: "active", ...DEFAULT_LIST })),
  campaigns: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(campaignListQuery({ view: "active", ...DEFAULT_LIST })),
};

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
    icon: <RulesetsIcon />,
    description: "Browse available rulesets",
    path: "/rulesets",
  },
  {
    id: "characters" as const,
    label: "Characters",
    icon: <CharactersIcon />,
    description: "View your characters",
    path: "/characters",
  },
  {
    id: "campaigns" as const,
    label: "Campaigns",
    icon: <CampaignsIcon />,
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
    icon: <HelpIcon />,
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
    () =>
      Object.fromEntries(
        sidebarItems.map(({ id }) => [
          id,
          (el: HTMLElement | null) => setSidebarItemEls((prev) => (prev[id] === el ? prev : { ...prev, [id]: el })),
        ]),
      ),
    [],
  );

  const isPopoverStep = onboardingOpen && !isMobile && stepToSidebarId[onboardingStep];
  const onboardingHighlightId = isPopoverStep ? stepToSidebarId[onboardingStep] : null;
  const effectiveExpanded = sidebarExpanded || !!isPopoverStep;

  const darkMode = theme.palette.mode === "dark";
  const gold = brandGold(darkMode);
  const goldFaint = brandGoldTint(darkMode, darkMode ? 0.25 : 0.2);

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
  const { signOut } = useAuthRequests();
  // Sidebar item of the first path segment ("rulesets" for /rulesets/123);
  // pages outside the sidebar (profile, invites) keep Dashboard highlighted.
  const pathSection = location.pathname.split("/")[1];
  const activeSection = sidebarItems.some((item) => !("external" in item) && item.id === pathSection)
    ? pathSection
    : "dashboard";

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  // Clearing the session clears the cache (`createQueryClient`), and the private route sends the user to sign in
  const handleSignOut = () => {
    handleMenuClose();
    void queryClient.cancelQueries();
    signOut.mutate();
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
    <Stack direction="row">
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
            <IconButton
              color="inherit"
              onClick={() => setMobileDrawerOpen(true)}
              edge="start"
              aria-label="Open navigation"
            >
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ width: drawerWidth }} />
          )}

          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={
              isMobile
                ? {
                    flex: 1,
                    textAlign: "center",
                    fontWeight: 700,
                  }
                : {
                    position: "absolute",
                    left: "50%",
                    transform: "translateX(-50%)",
                    fontWeight: 700,
                  }
            }
          >
            <AppBrand />
          </Typography>

          <Stack direction="row" spacing={{ xs: 0.5, sm: 2 }} sx={{ alignItems: "center", flexShrink: 0 }}>
            {!isDemo && <FeedbackButton />}
            {!isDemo && <NotificationBell />}
            {!isDemo && (
              <IconButton size="large" onClick={handleMenuOpen} color="inherit" aria-label="Account menu">
                <Avatar src={avatarAttachment?.url ?? undefined} sx={{ width: 32, height: 32 }}>
                  <AccountIcon />
                </Avatar>
              </IconButton>
            )}
          </Stack>

          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
            <ActionMenuItem icon={AccountIcon} label="Profile" onClick={handleProfile} />
            <ActionMenuItem
              icon={ActivityIcon}
              label="Activity"
              onClick={() => {
                handleMenuClose();
                navigate("/activities");
              }}
            />
            <ActionMenuItem icon={SettingsIcon} label="Settings" onClick={handleSettings} />
            <Divider />
            <ActionMenuItem icon={SignOutIcon} label="Sign Out" onClick={handleSignOut} />
          </Menu>
        </Toolbar>
      </AppBar>
      {/* Sidebar */}
      <Drawer
        sx={{
          width: isMobile ? expandedDrawerWidth : effectiveExpanded ? expandedDrawerWidth : drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: isMobile ? expandedDrawerWidth : effectiveExpanded ? expandedDrawerWidth : drawerWidth,
            boxSizing: "border-box",
            borderRight: "none",
            transition: transitionOf(["all"], DURATION.slow, EASING.emphasized),
            overflow: "hidden",
            bgcolor: "background.paper",
            boxShadow: (theme) => `2px 0 8px ${theme.palette.shadow}`,
          },
        }}
        variant={isMobile ? "temporary" : "permanent"}
        anchor="left"
        open={isMobile ? mobileDrawerOpen : true}
        onClose={() => setMobileDrawerOpen(false)}
      >
        <Toolbar />
        <Stack sx={{ flex: 1, minHeight: 0, position: "relative" }}>
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
                    justifyContent: isMobile || effectiveExpanded ? "flex-start" : "center",
                    px: isMobile || effectiveExpanded ? 2 : 1.5,
                    py: 1,
                    borderRadius: 3,
                    mx: 0.5,
                    position: "relative",
                    overflow: "hidden",
                    transition: transitionOf(["all"], DURATION.normal, EASING.emphasized),
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: (theme) =>
                        `linear-gradient(135deg, transparent, ${alpha(theme.palette.common.white, 0.1)})`,
                      opacity: 0,
                      transition: transitionOf(["opacity"]),
                    },
                    "&.Mui-selected": {
                      backgroundColor: "primary.main",
                      color: "common.white",
                      boxShadow: (theme) => `0 4px 12px ${alpha(theme.palette.primary.main, 0.25)}`,
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
                        color: "common.white",
                      },
                      "& .MuiListItemText-primary": {
                        fontWeight: 600,
                        color: "common.white",
                      },
                      "& .MuiListItemText-secondary": {
                        color: (theme) => alpha(theme.palette.common.white, 0.8),
                      },
                    },
                    "&:hover": {
                      backgroundColor: "action.hover",
                      transform: "translateX(2px)",
                    },
                    "& .MuiListItemIcon-root": {
                      color: "text.secondary",
                    },
                    "& .MuiListItemText-primary": {
                      color: "text.primary",
                    },
                    "& .MuiListItemText-secondary": {
                      color: "text.secondary",
                    },
                  }}
                  title={!(isMobile || effectiveExpanded) ? item.label : undefined}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      justifyContent: "center",
                      mr: isMobile || effectiveExpanded ? 2 : 0,
                      transition: transitionOf(["all"], DURATION.slow, EASING.emphasized),
                      "& .MuiSvgIcon-root": {
                        transition: transitionOf(["transform"]),
                      },
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={isMobile || effectiveExpanded ? item.description : null}
                    sx={{
                      opacity: isMobile || effectiveExpanded ? 1 : 0,
                      transform: isMobile || effectiveExpanded ? "translateX(0)" : "translateX(-10px)",
                      transition: transitionOf(["all"], DURATION.slow, EASING.emphasized),
                      transitionDelay: isMobile || effectiveExpanded ? "0.05s" : "0s",
                    }}
                    slotProps={{
                      primary: {
                        sx: { whiteSpace: "nowrap" },
                      },
                      secondary: {
                        sx: { typography: "caption", whiteSpace: "nowrap" },
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          {/* Toggle button at the bottom — hidden on mobile and during popover steps */}
          {!isMobile && !isPopoverStep && (
            <Stack
              direction="row"
              sx={{
                p: 2,
                pt: 3,
                justifyContent: "center",
                borderTop: 1,
                borderColor: "divider",
                bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.default" : "background.paper"),
              }}
            >
              <IconButton
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                aria-label={effectiveExpanded ? "Collapse sidebar" : "Expand sidebar"}
                sx={{
                  color: "text.secondary",
                  backgroundColor: "action.hover",
                  border: 2,
                  borderColor: "divider",
                  transition: transitionOf(["all"], DURATION.normal, EASING.emphasized),
                  "&:hover": {
                    backgroundColor: "action.focus",
                    borderColor: "primary.main",
                    color: "primary.main",
                    transform: "scale(1.1)",
                  },
                }}
                size="small"
              >
                {effectiveExpanded ? (
                  <ChevronLeftIcon sx={{ transition: transitionOf(["transform"]) }} />
                ) : (
                  <ChevronRightIcon sx={{ transition: transitionOf(["transform"]) }} />
                )}
              </IconButton>
            </Stack>
          )}
        </Stack>
      </Drawer>
      <AppMain banner={isDemo && <DemoBanner />} railWidth={isMobile ? 0 : drawerWidth} />
      <Onboarding
        open={onboardingOpen}
        onClose={handleOnboardingClose}
        activeStep={onboardingStep}
        onStepChange={setOnboardingStep}
        anchorEl={onboardingHighlightId ? (sidebarItemEls[onboardingHighlightId] ?? null) : null}
        isMobile={isMobile}
      />
    </Stack>
  );
}
