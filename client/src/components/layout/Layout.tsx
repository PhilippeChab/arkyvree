import {
  alpha,
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
  Tooltip,
  Typography,
} from "@mui/material";
import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { ActionMenuItem } from "@/client/src/components/common/index.ts";
import {
  AccountCircleIcon,
  CampaignIcon,
  ChangelogIcon,
  CharacterIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DashboardIcon,
  HelpIcon,
  HistoryIcon,
  LogoutIcon,
  MenuIcon,
  NotificationsIcon,
  RulesetIcon,
  SettingsIcon,
  SupportIcon,
} from "@/client/src/components/icons/index.ts";
import { Onboarding } from "@/client/src/components/onboarding/index.ts";
import {
  useAnchorMenu,
  useAttachment,
  useAuthRequests,
  useDemoTimeRemaining,
  useIsMobile,
} from "@/client/src/hooks/index.ts";
import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";
import {
  campaignListQuery,
  characterListQuery,
  dashboardStatsQuery,
  rulesetListQuery,
} from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { DURATION, EASING, PREFERS_REDUCED_MOTION, transitionOf } from "@/client/src/theme/animations.ts";

import { AppBrand, AppMain } from "./AppMain.tsx";
import { DemoBanner } from "./DemoBanner.tsx";
import { FeedbackButton } from "./FeedbackButton.tsx";
import { NotificationBell } from "./NotificationBell.tsx";

/** How a list page opens by default, which a prefetch asks for. */
const DEFAULT_LIST = { search: "", orderBy: "createdAt", orderDir: "desc" } as const;
const DRAWER_WIDTH = 72;

const EXPANDED_DRAWER_WIDTH = 240;

/**
 * Warm the first page of a section when its sidebar item is hovered. The options are the ones the pages use, filtered
 * the way a page opens by default.
 */
const PREFETCHERS: Partial<Record<string, (queryClient: QueryClient) => void>> = {
  dashboard: (queryClient) => void queryClient.prefetchQuery(dashboardStatsQuery()),
  rulesets: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(rulesetListQuery({ scope: undefined, ...DEFAULT_LIST })),
  characters: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(characterListQuery({ view: "active", ...DEFAULT_LIST })),
  campaigns: (queryClient) =>
    void queryClient.prefetchInfiniteQuery(campaignListQuery({ view: "active", ...DEFAULT_LIST })),
};

const SIDEBAR_ITEMS = [
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
    icon: <RulesetIcon />,
    description: "Browse available rulesets",
    path: "/rulesets",
  },
  {
    id: "characters" as const,
    label: "Characters",
    icon: <CharacterIcon />,
    description: "View your characters",
    path: "/characters",
  },
  {
    id: "campaigns" as const,
    label: "Campaigns",
    icon: <CampaignIcon />,
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
    path: EXTERNAL_LINKS.help,
    external: true,
  },
  {
    id: "changelog" as const,
    label: "Changelog",
    icon: <ChangelogIcon />,
    description: "What's new",
    path: EXTERNAL_LINKS.changelog,
    external: true,
  },
  {
    id: "support" as const,
    label: "Support Arkyvree",
    icon: <SupportIcon />,
    description: "Buy me a coffee",
    path: EXTERNAL_LINKS.support,
    external: true,
  },
];
const STEP_TO_SIDEBAR_ID: Record<number, string> = { 1: "rulesets", 2: "characters", 3: "campaigns" };

export function Layout() {
  const menu = useAnchorMenu();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const isMobile = useIsMobile();

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
        SIDEBAR_ITEMS.map(({ id }) => [
          id,
          // A router Link hands its ref a new callback each render, detaching it (null) first: keep the element, or
          // each render would set state again
          (el: HTMLElement | null) => {
            if (el) setSidebarItemEls((prev) => (prev[id] === el ? prev : { ...prev, [id]: el }));
          },
        ]),
      ),
    [],
  );

  const isPopoverStep = onboardingOpen && !isMobile && STEP_TO_SIDEBAR_ID[onboardingStep];
  const onboardingHighlightId = isPopoverStep ? STEP_TO_SIDEBAR_ID[onboardingStep] : null;
  const effectiveExpanded = sidebarExpanded || !!isPopoverStep;

  const onboardingMutation = useMutation({
    mutationFn: () => parseResponse(rpc.auth["complete-onboarding"].$post()),
  });

  const handleOnboardingClose = useCallback(() => {
    setOnboardingOpen(false);
    updateUser({ onboardingCompletedAt: new Date().toISOString() });
    onboardingMutation.mutate();
  }, [onboardingMutation, updateUser]);

  const location = useLocation();
  const queryClient = useQueryClient();
  const { signOut } = useAuthRequests();
  // Sidebar item of the first path segment ("rulesets" for /rulesets/123);
  // pages outside the sidebar (profile, invites) keep Dashboard highlighted.
  const pathSection = location.pathname.split("/")[1];
  const activeSection = SIDEBAR_ITEMS.some((item) => !("external" in item) && item.id === pathSection)
    ? pathSection
    : "dashboard";

  // Clearing the session clears the cache (`createQueryClient`), and the private route sends the user to sign in
  const handleSignOut = () => {
    menu.closeMenu();
    void queryClient.cancelQueries();
    signOut.mutate();
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
        <Toolbar sx={{ justifyContent: "space-between" }}>
          {isMobile ? (
            <IconButton
              color="inherit"
              onClick={() => setMobileDrawerOpen(true)}
              edge="start"
              aria-label="Open Navigation"
            >
              <MenuIcon />
            </IconButton>
          ) : (
            <Box sx={{ width: DRAWER_WIDTH }} />
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
              <Tooltip title="Account Menu">
                <IconButton size="large" onClick={menu.openMenu} color="inherit" aria-label="Account Menu">
                  <Avatar src={avatarAttachment?.url ?? undefined} sx={{ width: 32, height: 32 }}>
                    <AccountCircleIcon />
                  </Avatar>
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            <ActionMenuItem icon={AccountCircleIcon} label="Profile" to="/profile" onClick={menu.closeMenu} />
            <ActionMenuItem icon={HistoryIcon} label="Activity" to="/activities" onClick={menu.closeMenu} />
            <ActionMenuItem icon={SettingsIcon} label="Settings" to="/settings" onClick={menu.closeMenu} />
            <Divider />
            <ActionMenuItem icon={LogoutIcon} label="Sign Out" onClick={handleSignOut} />
          </Menu>
        </Toolbar>
      </AppBar>
      {/* Sidebar */}
      <Drawer
        sx={{
          width: isMobile ? EXPANDED_DRAWER_WIDTH : effectiveExpanded ? EXPANDED_DRAWER_WIDTH : DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: isMobile ? EXPANDED_DRAWER_WIDTH : effectiveExpanded ? EXPANDED_DRAWER_WIDTH : DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: "none",
            transition: transitionOf(["all"], DURATION.deliberate, EASING.emphasized),
            overflow: "hidden",
            bgcolor: (theme) => (theme.palette.mode === "dark" ? "background.paper" : "grey.50"),
            boxShadow: (theme) => theme.boxShadows.drawer,
          },
        }}
        variant={isMobile ? "temporary" : "permanent"}
        anchor="left"
        open={isMobile ? mobileDrawerOpen : true}
        onClose={() => setMobileDrawerOpen(false)}
      >
        <Toolbar />
        <Stack sx={{ flex: 1, minHeight: 0, position: "relative" }}>
          <Stack component={List} spacing={1} sx={{ flex: 1, pt: 2, pb: 2, px: 1.5 }}>
            {SIDEBAR_ITEMS.map((item) => (
              <ListItem key={item.id} disablePadding>
                <ListItemButton
                  ref={sidebarItemRefs[item.id]}
                  {...("external" in item && item.external
                    ? { component: "a", href: item.path, target: "_blank", rel: "noopener noreferrer" }
                    : { component: Link, to: item.path })}
                  selected={!("external" in item) && activeSection === item.id}
                  onClick={() => {
                    if (isMobile) setMobileDrawerOpen(false);
                  }}
                  onMouseEnter={() => PREFETCHERS[item.id]?.(queryClient)}
                  sx={{
                    height: 48,
                    minHeight: "unset",
                    boxShadow: (theme) => (onboardingHighlightId === item.id ? theme.boxShadows.highlight : undefined),
                    alignItems: "center",
                    justifyContent: isMobile || effectiveExpanded ? "flex-start" : "center",
                    px: isMobile || effectiveExpanded ? 2 : 1.5,
                    py: 1,
                    borderRadius: 3,
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
                      transition: transitionOf(["opacity"], DURATION.normal),
                    },
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "common.white",
                      boxShadow: (theme) => theme.boxShadows.selectedItem,
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
                        bgcolor: "secondary.main",
                      },
                      "&:hover": {
                        bgcolor: "primary.dark",
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
                      bgcolor: "action.hover",
                      transform: "translateX(2px)",
                    },
                    [PREFERS_REDUCED_MOTION]: {
                      "&:hover": { transform: "none" },
                    },
                    "& .MuiListItemIcon-root": {
                      color: (theme) => (theme.palette.mode === "dark" ? "grey.400" : "grey.700"),
                    },
                    "& .MuiListItemText-primary": {
                      color: (theme) => (theme.palette.mode === "dark" ? "grey.100" : "grey.900"),
                    },
                    "& .MuiListItemText-secondary": {
                      color: (theme) => (theme.palette.mode === "dark" ? "grey.500" : "grey.600"),
                    },
                  }}
                  title={!(isMobile || effectiveExpanded) ? item.label : undefined}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 0,
                      justifyContent: "center",
                      pr: isMobile || effectiveExpanded ? 2 : 0,
                      transition: transitionOf(["all"], DURATION.deliberate, EASING.emphasized),
                      "& .MuiSvgIcon-root": {
                        fontSize: "1.4rem",
                        transition: transitionOf(["transform"], DURATION.normal),
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
                      transition: transitionOf(["all"], DURATION.deliberate, EASING.emphasized),
                      transitionDelay: `${isMobile || effectiveExpanded ? DURATION.beat : 0}ms`,
                    }}
                    slotProps={{
                      primary: {
                        sx: { fontSize: "0.95rem", whiteSpace: "nowrap" },
                      },
                      secondary: {
                        sx: { fontSize: "0.75rem", whiteSpace: "nowrap" },
                      },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </Stack>

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
                aria-label="Sidebar"
                aria-expanded={effectiveExpanded}
                sx={{
                  color: (theme) => (theme.palette.mode === "dark" ? "grey.400" : "grey.700"),
                  bgcolor: "sidebar.toggle",
                  border: 2,
                  borderColor: "divider",
                  transition: transitionOf(["all"], DURATION.normal, EASING.emphasized),
                  "&:hover": {
                    bgcolor: "sidebar.toggleHover",
                    borderColor: "primary.main",
                    color: "primary.main",
                    transform: "scale(1.1)",
                  },
                  [PREFERS_REDUCED_MOTION]: {
                    "&:hover": { transform: "none" },
                  },
                }}
                size="small"
              >
                {effectiveExpanded ? (
                  <ChevronLeftIcon sx={{ transition: transitionOf(["transform"], DURATION.normal) }} />
                ) : (
                  <ChevronRightIcon sx={{ transition: transitionOf(["transform"], DURATION.normal) }} />
                )}
              </IconButton>
            </Stack>
          )}
        </Stack>
      </Drawer>
      <AppMain banner={isDemo && <DemoBanner />} railWidth={isMobile ? 0 : DRAWER_WIDTH} />
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
