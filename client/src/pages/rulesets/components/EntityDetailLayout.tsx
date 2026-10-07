import { Container, Menu, Skeleton, Stack } from "@mui/material";
import { type ComponentProps, type ReactNode } from "react";

import { ActionMenuItem, DetailPageHeader, PageError, PageTransition } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { useAnchorMenu } from "@/client/src/hooks/index.ts";

interface EntityDetailLayoutProps {
  /** Momentarily nowhere sensible to go back to: Back hides meanwhile. */
  backDisabled?: boolean;
  /** Where Back goes: a link */
  backTo: string;
  canDelete: boolean;
  children: ReactNode;
  entityName?: string;
  isLoading?: boolean;
  onDelete?: () => void;
  rulesetName?: string;
  /** Replaces "<ruleset> Ruleset" under the title. */
  subtitle?: ReactNode;
}

type EntityPageErrorProps = ComponentProps<typeof PageError>;

/** An entity page: its column (up to 1200px), opening on the detail pages' header, its delete in the header's menu. */
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
  const menu = useAnchorMenu();

  if (isLoading) {
    return (
      <Container maxWidth="lg">
        {/* The header's skeleton, as tall as `DetailPageHeader`, then the details panel's */}
        <Stack spacing={4}>
          <Stack
            direction="row"
            sx={{ alignItems: "center", py: 2, borderBottom: 1, borderColor: "divider", position: "relative" }}
          >
            <Skeleton variant="circular" width={48} height={48} sx={{ position: "absolute", left: 0 }} />
            <Stack spacing={1} sx={{ flexGrow: 1, alignItems: "center", px: { xs: 5, md: 8 } }}>
              <Skeleton variant="text" width={240} sx={{ typography: { xs: "h4", md: "h3" } }} />
              <Skeleton variant="text" width={160} sx={{ typography: "body1" }} />
            </Stack>
          </Stack>
          <Skeleton variant="rounded" height={200} />
        </Stack>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="lg">
        {/* The page's blocks: its header, then what the page holds (a details card, its tabs, a tab's panel) */}
        <Stack spacing={4}>
          <DetailPageHeader
            title={entityName}
            description={subtitle || `${rulesetName} Ruleset`}
            backTo={backDisabled ? undefined : backTo}
            onMenuOpen={canDelete && onDelete ? menu.openMenu : undefined}
          />
          {canDelete && onDelete && (
            // The menu button can unmount and come back (e.g. while a copy loads): only anchor to one still on the page
            <Menu anchorEl={menu.anchorEl} open={!!menu.anchorEl?.isConnected} onClose={menu.closeMenu}>
              <ActionMenuItem
                icon={DeleteIcon}
                label="Delete Permanently"
                intent="destructive"
                onClick={menu.closeMenuAnd(onDelete)}
              />
            </Menu>
          )}
          {children}
        </Stack>
      </Container>
    </PageTransition>
  );
}

/** An entity page that couldn't load its entity, in the page's column. */
export function EntityPageError({ ...props }: EntityPageErrorProps) {
  return (
    <Container maxWidth="lg">
      <PageError {...props} />
    </Container>
  );
}
