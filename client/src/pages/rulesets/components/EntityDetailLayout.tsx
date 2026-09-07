import { useIsMobile } from "@/client/src/hooks/index.ts";
import {
  DURATION,
  EASING,
  fadeInUp,
  prefersReducedMotion,
} from "@/client/src/lib/animations.ts";
import {
  ArrowBack,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import {
  Box,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";

interface EntityDetailLayoutProps {
  entityName?: string;
  rulesetName?: string;
  subtitle?: string;
  onBack: () => void;
  canDelete: boolean;
  onDelete?: () => void;
  isLoading?: boolean;
  children: ReactNode;
}

export function EntityDetailLayout({
  entityName,
  rulesetName,
  subtitle,
  onBack,
  canDelete,
  onDelete,
  isLoading,
  children,
}: EntityDetailLayoutProps) {
  const isMobile = useIsMobile();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (isLoading) {
    return (
      <Box sx={{ maxWidth: 1200, margin: "0 auto", p: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: 4, display: "flex", alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}>
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
    <Box sx={{
      maxWidth: 1200,
      margin: "0 auto",
      p: { xs: 2, sm: 3 },
      animation: `${fadeInUp} ${DURATION.normal}ms ${EASING.decelerate} both`,
      [prefersReducedMotion]: { animation: "none" },
    }}>
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
          onClick={onBack}
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
          <Typography sx={{ fontWeight: 600, mb: 0.5, typography: { xs: "h5", md: "h4" } }}>
            {entityName}
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {subtitle || `${rulesetName} Ruleset`}
          </Typography>
        </Box>
        {canDelete && onDelete && (
          <>
            <IconButton
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
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem onClick={() => { setAnchorEl(null); onDelete(); }} sx={{ color: "error.main" }}>
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
