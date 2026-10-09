import { ConfirmDialog } from "@/client/src/components/common/index.ts";

import type { Contributor } from "./contributorKinds.ts";

interface RemoveContributorDialogProps {
  /** The contributor it asks about, kept while it fades out (`useDialogState`'s `target`). */
  contributor: Contributor | null;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  pending: boolean;
}

/** Asks before a ruleset's or a character's contributor is removed, naming them as the contributors' table does. */
export function RemoveContributorDialog({
  contributor,
  open,
  onClose,
  onConfirm,
  pending,
}: RemoveContributorDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      pending={pending}
      title="Remove Contributor"
      message={
        <>
          Are you sure you want to remove <strong>{contributor?.user?.username || contributor?.email}</strong> as a
          contributor?
        </>
      }
      confirmLabel="Remove Contributor"
      intent="destructive"
    />
  );
}
