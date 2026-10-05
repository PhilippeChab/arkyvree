import { ArrowBack, MoreVert as MoreVertIcon } from "@mui/icons-material";
import { Box, IconButton, Menu, MenuItem, Skeleton, Typography } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";

import { PageError } from "@/client/src/components/common/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { DURATION, EASING, fadeInUp, prefersReducedMotion } from "@/client/src/lib/animations.ts";

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

/** An entity page's column: centered, up to 1200px. */
const PAGE_SX = { maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } } as const;

/** An entity page that couldn't load its entity, in the page's column. */
export function EntityPageError(props: ComponentProps<typeof PageError>) {
  return (
    <Box sx={PAGE_SX}>
      <PageError {...props} />
    </Box>
  );
}

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (isLoading) {
    return (
      <Box sx={PAGE_SX}>
        <Box
          sx={{
            mb: 4,
            display: "flex",
            alignItems: "center",
            py: 2,
            borderBottom: 1,
            borderColor: "divider",
            position: "relative",
          }}
        >
          <Skeleton variant="circular" width={40} height={40} sx={{ position: "absolute", left: 0 }} />
          <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, sm: 8 } }}>
            <Skeleton variant="text" width={200} height={40} sx={{ mx: "auto" }} />
            <Skeleton variant="text" width={150} height={24} sx={{ mx: "auto" }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ...PAGE_SX,
        animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
        [prefersReducedMotion]: { animation: "none" },
      }}
    >
      <Box
        sx={{
          mb: 4,
          display: "flex",
          alignItems: "center",
          py: 2,
          borderBottom: 1,
          borderColor: "divider",
          position: "relative",
        }}
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
          <ArrowBack />
        </IconButton>
        <Box
          sx={{
            flexGrow: 1,
            textAlign: "center",
            px: { xs: 5, sm: 8 },
          }}
        >
          <Typography sx={{ fontWeight: 600, mb: 0.5, typography: { xs: "h5", md: "h4" } }}>{entityName}</Typography>
          <Typography component="div" variant="body2" sx={{ color: "text.secondary" }}>
            {subtitle || `${rulesetName} Ruleset`}
          </Typography>
        </Box>
        {canDelete && onDelete && (
          <>
            <IconButton
              aria-label="More actions"
              size={isMobile ? "medium" : "large"}
              onClick={(e) => setAnchorEl(e.currentTarget)}
              sx={{
                position: "absolute",
                right: 0,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              // The menu button can unmount and come back (e.g. while a copy loads): only
              // anchor to one still on the page.
              open={!!anchorEl?.isConnected}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  onDelete();
                }}
                sx={{ color: "error.main" }}
              >
                Delete
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
      {children}
    </Box>
  );
}
