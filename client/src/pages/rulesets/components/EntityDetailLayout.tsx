import { Box, IconButton, Menu, MenuItem, Skeleton, Stack, Typography } from "@mui/material";
import { type ComponentProps, type ReactNode } from "react";

import { PageError } from "@/client/src/components/common/index.ts";
import { ArrowBackIcon, MoreVertIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu, useIsMobile } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeInUp, PREFERS_REDUCED_MOTION } from "@/client/src/theme/animations.ts";

interface EntityDetailLayoutProps {
  entityName?: string;
  rulesetName?: string;
  /** Replaces "<ruleset> Ruleset" under the title. */
  subtitle?: ReactNode;
  onBack: () => void;
  /** Momentarily nowhere sensible to go back to. */
  backDisabled?: boolean;
  canDelete: boolean;
  onDelete?: () => void;
  isLoading?: boolean;
  children: ReactNode;
}

type EntityPageErrorProps = ComponentProps<typeof PageError>;

/** An entity page's column: centered, up to 1200px. */
const PAGE_SX = { maxWidth: 1200, mx: "auto", p: { xs: 2, sm: 3 } } as const;

export function EntityDetailLayout({
  entityName,
  rulesetName,
  subtitle,
  onBack,
  backDisabled,
  canDelete,
  onDelete,
  isLoading,
  children,
}: EntityDetailLayoutProps) {
  const isMobile = useIsMobile();
  const menu = useAnchorMenu();

  if (isLoading) {
    return (
      <Stack spacing={4} sx={PAGE_SX}>
        <Stack
          direction="row"
          sx={{ alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}
        >
          <Skeleton variant="circular" width={40} height={40} sx={{ position: "absolute", left: 0 }} />
          <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, sm: 8 } }}>
            <Skeleton variant="text" width={200} height={40} sx={{ mx: "auto" }} />
            <Skeleton variant="text" width={150} height={24} sx={{ mx: "auto" }} />
          </Box>
        </Stack>
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      </Stack>
    );
  }

  return (
    // The page's blocks: its header, then what the page holds (a details card, its tabs, a tab's panel)
    <Stack
      spacing={4}
      sx={{
        ...PAGE_SX,
        animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
        [PREFERS_REDUCED_MOTION]: { animation: "none" },
      }}
    >
      <Stack
        direction="row"
        sx={{ alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}
      >
        <IconButton
          aria-label="Back"
          onClick={onBack}
          disabled={backDisabled}
          size={isMobile ? "medium" : "large"}
          sx={{
            position: "absolute",
            left: 0,
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Stack spacing={0.5} sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, sm: 8 } }}>
          <Typography component="h1" sx={{ fontWeight: 600, typography: { xs: "h5", md: "h4" } }}>
            {entityName}
          </Typography>
          <Typography component="div" variant="body2" sx={{ color: "text.secondary" }}>
            {subtitle || `${rulesetName} Ruleset`}
          </Typography>
        </Stack>
        {canDelete && onDelete && (
          <>
            <IconButton
              aria-label="More actions"
              size={isMobile ? "medium" : "large"}
              onClick={menu.openMenu}
              sx={{
                position: "absolute",
                right: 0,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={menu.anchorEl}
              // The menu button can unmount and come back (e.g. while a copy loads): only
              // anchor to one still on the page.
              open={!!menu.anchorEl?.isConnected}
              onClose={menu.closeMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem onClick={menu.closeMenuAnd(onDelete)} sx={{ color: "error.main" }}>
                Delete
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>
      {children}
    </Stack>
  );
}

/** An entity page that couldn't load its entity, in the page's column. */
export function EntityPageError({ ...props }: EntityPageErrorProps) {
  return (
    <Box sx={PAGE_SX}>
      <PageError {...props} />
    </Box>
  );
}
