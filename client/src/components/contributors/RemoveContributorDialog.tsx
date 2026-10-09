import { ConfirmDialog } from "@/client/src/components/common/index.ts";
import { DeleteIcon, LeaveIcon } from "@/client/src/components/icons/index.ts";

import { type Contributor, CONTRIBUTOR_KINDS, type ContributorKind } from "./contributorKinds.ts";

interface RemoveContributorDialogProps {
  /** The contributor it asks about, kept while it fades out (`useDialogState`'s `target`); none as the session leaves. */
  contributor?: Contributor | null;
  /** The session leaves, instead of removing a contributor. */
  isSelfRemoval?: boolean;
  kind: ContributorKind;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
}

/**
 * Asks before a ruleset's or a character's contributor is removed, naming them as the contributors' table does, or
 * before the session leaves: in a campaign player's words (`RemovePlayerDialog`).
 */
export function RemoveContributorDialog({
  contributor,
  isSelfRemoval = false,
  kind,
  open,
  onClose,
  onConfirm,
  pending,
}: RemoveContributorDialogProps) {
  const { label, noun } = CONTRIBUTOR_KINDS[kind];
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      pending={pending}
      title={isSelfRemoval ? `Leave ${label}` : "Remove Contributor"}
      message={
        isSelfRemoval ? (
          `Are you sure you want to leave this ${noun}? You will lose access unless you're invited again.`
        ) : (
          <>
            Are you sure you want to remove <strong>{contributor?.user?.username || contributor?.email}</strong> as a
            contributor? This action cannot be undone.
          </>
        )
      }
      confirmLabel={isSelfRemoval ? `Leave ${label}` : "Remove Contributor"}
      intent={isSelfRemoval ? "caution" : "destructive"}
      confirmIcon={isSelfRemoval ? <LeaveIcon /> : <DeleteIcon />}
    />
  );
}
