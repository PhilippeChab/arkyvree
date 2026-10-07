import { DeleteDialog, LoadError } from "@/client/src/components/common/index.ts";

interface EntityDeleteDialogProps {
  /** Why the ruleset's Local Changes didn't load, which tell a copy of an inherited entity (`useRestorableDelete`) */
  changesError?: unknown;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  /** Its delete can be undone from Local Changes (`useRestorableDelete`): a fork's inherited entity, or what it holds. */
  restorable: boolean;
  /** What it deletes, as its title names it: "Language", "Modifier". */
  what: string;
}

/** A ruleset's delete, which says whether it can be undone: what a fork inherits comes back from its Local Changes. */
export function EntityDeleteDialog({ what, restorable, changesError, ...props }: EntityDeleteDialogProps) {
  return (
    <DeleteDialog
      {...props}
      title={`Delete ${what}`}
      message={
        restorable
          ? `Are you sure you want to delete this ${what.toLowerCase()}? You can restore it from Local Changes.`
          : `Are you sure you want to delete this ${what.toLowerCase()}? This action cannot be undone.`
      }
    >
      {!!changesError && <LoadError what="Local Changes" error={changesError} />}
    </DeleteDialog>
  );
}
