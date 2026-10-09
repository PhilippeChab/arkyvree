import { Container, Menu, Skeleton, Stack } from "@mui/material";
import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { type ComponentProps, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { ActionMenuItem, DetailPageHeader, PageError, PageTransition } from "@/client/src/components/common/index.ts";
import { DeleteIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, useDialogState } from "@/client/src/hooks/index.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { capitalize } from "@/shared/text.ts";

import { EntityDeleteDialog } from "./EntityDeleteDialog.tsx";

/** An entity page's delete, its header's menu offers to who may delete it: confirmed, it goes Back once it's done. */
interface EntityDeletion {
  /** Why the ruleset's Local Changes didn't load, which tell a copy of an inherited entity (`useRestorableDelete`) */
  changesError?: unknown;
  /** Deletes the entity: the delete mutation's request */
  deleteFn: () => Promise<unknown>;
  /** Its own queries, removed once it's gone, so Back never renders it from the cache */
  entityKey: QueryKey;
  /** The lists it showed in, which its delete refreshes with the ruleset's Local Changes */
  listKeys: readonly QueryKey[];
  /**
   * Its delete can be undone from Local Changes (`useRestorableDelete`): its menu says "Delete", not "Delete
   * Permanently", and its confirmation says so.
   */
  restorable: boolean;
  rulesetId: string;
}

interface EntityDetailLayoutProps {
  /** Momentarily nowhere sensible to go back to: Back hides meanwhile. */
  backDisabled?: boolean;
  /** Where Back goes: a link, and where a delete leaves to */
  backTo: string;
  children: ReactNode;
  /** Its delete, for who may delete it */
  deletion?: EntityDeletion;
  entityName?: string;
  isLoading?: boolean;
  rulesetName?: string;
  /** Replaces "<what> in <ruleset>" under the title. */
  subtitle?: ReactNode;
  /** What it is, as the header says it ("Language in Core SRD 3.5") and its delete names it: "Language", "Class Level" */
  what: string;
}

type EntityPageErrorProps = ComponentProps<typeof PageError>;

/**
 * An entity page: its column (up to 1200px), opening on the detail pages' header, its delete in the header's menu,
 * which asks first (`EntityDeleteDialog`).
 */
export function EntityDetailLayout({
  entityName,
  rulesetName,
  subtitle,
  what,
  backTo,
  backDisabled,
  deletion,
  isLoading,
  children,
}: EntityDetailLayoutProps) {
  const menu = useAnchorMenu();
  // The delete its confirmation opened on, which it keeps while it fades out
  const confirm = useDialogState<EntityDeletion>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const deleteMutation = useMutation({
    mutationFn: (confirmed: EntityDeletion) => confirmed.deleteFn(),
    onSuccess: (_, { rulesetId, listKeys, entityKey }) => {
      invalidateRulesetEdit(queryClient, rulesetId, listKeys);
      snackbar.success(`${capitalize(what.toLowerCase())} deleted`);
      navigate(backTo);
      // Gone: don't let Back render it from the cache
      queryClient.removeQueries({ queryKey: entityKey });
    },
    onError: (error) => snackbar.error(error, `Failed to delete ${what.toLowerCase()}`),
  });
  // What it confirms follows the page's delete while there's one: its Local Changes may load meanwhile
  const confirming = deletion ?? confirm.target;

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
            description={subtitle ?? `${what} in ${rulesetName}`}
            backTo={backDisabled ? undefined : backTo}
            onMenuOpen={deletion ? menu.openMenu : undefined}
          />
          {deletion && (
            // The menu button can unmount and come back (e.g. while a copy loads): only anchor to one still on the page
            <Menu anchorEl={menu.anchorEl} open={!!menu.anchorEl?.isConnected} onClose={menu.closeMenu}>
              <ActionMenuItem
                icon={DeleteIcon}
                label={deletion.restorable ? "Delete" : "Delete Permanently"}
                intent="destructive"
                onClick={menu.closeMenuAnd(() => confirm.openWith(deletion))}
              />
            </Menu>
          )}
          {children}
        </Stack>
      </Container>
      {confirm.target && confirming && (
        <EntityDeleteDialog
          open={confirm.open}
          onClose={confirm.close}
          what={what}
          restorable={confirming.restorable}
          changesError={confirming.changesError}
          onConfirm={() => deleteMutation.mutate(confirming)}
          isLoading={deleteMutation.isPending}
        />
      )}
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
