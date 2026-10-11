import { Button, DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import type { ReactNode } from "react";

import {
  AddButton,
  BlankNote,
  DialogFooter,
  DiceSpinner,
  ListToolbar,
  LoadError,
  LoadMoreButton,
  Modal,
  RowAction,
} from "@/client/src/components/common/index.ts";
import { DeleteIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";
import type { ContributorRole } from "@/shared/enums.ts";

import { type Contributor, CONTRIBUTOR_KINDS, type ContributorKind } from "./contributorKinds.ts";
import { ContributorsTable } from "./ContributorsTable.tsx";
import { InviteContributorDialog } from "./InviteContributorDialog.tsx";
import { RemoveContributorDialog } from "./RemoveContributorDialog.tsx";
import { useContributors } from "./useContributors.ts";

interface ContributorsDialogProps {
  /** Whether the session may invite: it manages the contributors, of a record that isn't archived. */
  canInvite: boolean;
  /** Whether the session contributes, and may leave. */
  canLeave: boolean;
  /**
   * Whether the session may remove this contributor, when it manages them (a ruleset's Admin is its owner's alone):
   * without it, the rows show no actions.
   */
  canRemove?: (contributor: Contributor) => boolean;
  /** The ruleset's or the character's id. */
  id: string;
  kind: ContributorKind;
  onClose: () => void;
  open: boolean;
  /** The roles an invite offers (a ruleset's); none when omitted, every contributor an Editor. */
  roles?: ContributorRole[];
  /** A row's actions before Remove: a ruleset's Edit Role. */
  rowActions?: (contributor: Contributor) => ReactNode;
}

/**
 * A ruleset's or a character's contributors, under its owner: invited and removed by who manages them, left by a
 * contributor, in one wording whatever the kind.
 */
export function ContributorsDialog({
  kind,
  id,
  open,
  onClose,
  canInvite,
  canLeave,
  canRemove,
  roles,
  rowActions,
}: ContributorsDialogProps) {
  const { lead } = CONTRIBUTOR_KINDS[kind];
  const contributors = useContributors(kind, id, open);
  const { removeDialog, leaveDialog } = contributors;

  const renderList = () => {
    if (contributors.isLoading) return <DiceSpinner sx={{ py: 4 }} />;
    if (contributors.error && !contributors.hasData)
      return <LoadError what="Contributors" error={contributors.error} />;
    return (
      <Stack spacing={2}>
        <ContributorsTable
          owner={contributors.owner}
          contributors={contributors.contributors}
          renderActions={
            canRemove &&
            ((contributor) => (
              <>
                {rowActions?.(contributor)}
                {canRemove(contributor) && (
                  <RowAction
                    icon={DeleteIcon}
                    label="Remove"
                    intent="destructive"
                    onClick={() => removeDialog.openWith(contributor)}
                  />
                )}
              </>
            ))
          }
        />
        {/* None but its owner yet: said under the owner's row */}
        {contributors.contributors.length === 0 && (
          <Stack spacing={2} sx={{ alignItems: "flex-start" }}>
            <BlankNote>No contributors yet</BlankNote>
            {canInvite && (
              <AddButton variant="outlined" label="Invite a Contributor" onClick={contributors.openInvite} />
            )}
          </Stack>
        )}
        <LoadMoreButton
          hasNextPage={contributors.hasNextPage}
          isFetchingNextPage={contributors.isFetchingNextPage}
          onClick={() => contributors.fetchNextPage()}
        />
      </Stack>
    );
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <DialogTitle>Contributors</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <DialogContentText>{lead}</DialogContentText>
            {(canLeave || canInvite) && (
              <ListToolbar
                actions={
                  <>
                    {canLeave && (
                      <Button
                        variant="contained"
                        color="warning"
                        size="small"
                        startIcon={<LeaveIcon />}
                        onClick={() => leaveDialog.openWith(true)}
                      >
                        Leave
                      </Button>
                    )}
                    {canInvite && <AddButton label="Invite" onClick={contributors.openInvite} />}
                  </>
                }
              />
            )}
            <Stack sx={{ minHeight: { xs: 280, sm: 360 } }}>{renderList()}</Stack>
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={onClose} cancelLabel="Close" />
      </Modal>

      <InviteContributorDialog
        open={contributors.inviteDialog.open}
        onClose={contributors.inviteDialog.close}
        form={contributors.inviteForm}
        onSubmit={(invite) => contributors.inviteMutation.mutate(invite)}
        pending={contributors.inviteMutation.isPending}
        roles={roles}
      />

      <RemoveContributorDialog
        kind={kind}
        contributor={removeDialog.target}
        open={removeDialog.open}
        onClose={removeDialog.close}
        onConfirm={() => removeDialog.target && contributors.removeMutation.mutate(removeDialog.target.id)}
        pending={contributors.removeMutation.isPending}
      />

      <RemoveContributorDialog
        kind={kind}
        isSelfRemoval
        open={leaveDialog.open}
        onClose={leaveDialog.close}
        onConfirm={() => contributors.leaveMutation.mutate()}
        pending={contributors.leaveMutation.isPending}
      />
    </>
  );
}
