import { ConfirmDialog } from "@/client/src/components/common/index.ts";

interface RemovableContributor {
  email: string;
  user?: { username?: string | null } | null;
}

interface RemoveContributorDialogProps {
  /** The contributor it asks about, kept while it fades out (`useDialogState`'s `target`). */
  contributor: RemovableContributor | null;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
}

/** Asks before a ruleset's or a character's contributor is removed, naming them as the contributors' table does. */
export function RemoveContributorDialog({
  contributor,
  open,
  onClose,
  onConfirm,
  isLoading,
}: RemoveContributorDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      title="Remove Contributor"
      message={
        <>
          Are you sure you want to remove <strong>{contributor?.user?.username || contributor?.email}</strong> as a
          contributor?
        </>
      }
      confirmLabel="Remove"
      confirmColor="error"
    />
  );
}
