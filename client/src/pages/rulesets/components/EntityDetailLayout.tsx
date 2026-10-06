import { Box, IconButton, Menu, Skeleton, Stack, Typography } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ActionMenuItem, PageBody, PageError } from "@/client/src/components/common/index.ts";
import { BackIcon, DeleteIcon, MoreIcon } from "@/client/src/components/icons/index.ts";
import { useIsMobile } from "@/client/src/hooks/index.ts";

interface EntityDetailLayoutProps {
  entityName?: string;
  rulesetName?: string;
  /** Replaces "<ruleset> Ruleset" under the title. */
  subtitle?: ReactNode;
  /** Where Back goes */
  backTo: string;
  /** Momentarily nowhere sensible to go back to. */
  backDisabled?: boolean;
  canDelete: boolean;
  onDelete?: () => void;
  isLoading?: boolean;
  children: ReactNode;
}

type EntityPageErrorProps = ComponentProps<typeof PageError>;

/** An entity page's column: centered, up to 1200px. */
export function EntityDetailLayout({
  entityName,
  rulesetName,
  subtitle,
  backTo,
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
      <PageBody width="lg">
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
      </PageBody>
    );
  }

  return (
    <PageBody width="lg">
      <Stack
        direction="row"
        sx={{ alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}
      >
        <IconButton
          aria-label="Back"
          component={Link}
          to={backTo}
          disabled={backDisabled}
          size={isMobile ? "medium" : "large"}
          sx={{
            position: "absolute",
            left: 0,
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <BackIcon />
        </IconButton>
        <Box
          sx={{
            flexGrow: 1,
            textAlign: "center",
            px: { xs: 5, sm: 8 },
          }}
        >
          <Typography component="h1" variant="h3" gutterBottom>
            {entityName}
          </Typography>
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
              <MoreIcon />
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
              <ActionMenuItem
                icon={DeleteIcon}
                label="Delete"
                intent="destructive"
                onClick={() => {
                  setAnchorEl(null);
                  onDelete();
                }}
              />
            </Menu>
          </>
        )}
      </Stack>
      {children}
    </PageBody>
  );
}

/** An entity page that couldn't load its entity, in the page's column. */
export function EntityPageError(props: EntityPageErrorProps) {
  return (
    <PageBody width="lg">
      <PageError {...props} />
    </PageBody>
  );
}
