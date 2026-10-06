import { Menu, Skeleton } from "@mui/material";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";

import { ActionMenuItem, DetailPageHeader, PageBody, PageError } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";

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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (isLoading) {
    return (
      <PageBody width="lg">
        <DetailPageHeader
          title={<Skeleton width={200} sx={{ mx: "auto" }} />}
          description={<Skeleton width={150} sx={{ mx: "auto" }} />}
          backTo={backTo}
        />
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      </PageBody>
    );
  }

  return (
    <PageBody width="lg">
      <DetailPageHeader
        title={entityName}
        description={subtitle || `${rulesetName} Ruleset`}
        backTo={backTo}
        backDisabled={backDisabled}
        onMenuOpen={canDelete && onDelete ? (e) => setAnchorEl(e.currentTarget) : undefined}
      />
      {canDelete && onDelete && (
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
      )}
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
