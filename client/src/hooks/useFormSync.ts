import { useEffect, useRef } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Keep an edit form showing the latest server values without wiping unsaved
 * edits. While the form is clean it follows the server; a change that arrives
 * while it is dirty is held back and applied once the edits are saved or
 * undone. Pass `undefined` while the data is loading.
 *
 * Returns a getter for the `updatedAt` of the server values the form is based
 * on. Send that as the stale-edit token, not the query's current `updatedAt`:
 * when the record changed under the user's edits, the save then conflicts
 * instead of silently overwriting the newer values.
 *
 * After a save, `form.reset()` to what was saved, preferably the server's
 * response; the refetched data takes over once it arrives.
 */
export function useFormSync<T extends FieldValues>(
  form: UseFormReturn<T>,
  values: NoInfer<T> | undefined,
  updatedAt?: string,
): () => string | undefined {
  const { isDirty } = form.formState;
  // Compare by content: a refetch returns new objects even when nothing changed.
  const snapshot = values === undefined ? undefined : JSON.stringify(values);
  const synced = useRef<{ snapshot: string; updatedAt: string | undefined }>(undefined);

  useEffect(() => {
    if (snapshot === undefined) return;
    if (synced.current?.snapshot === snapshot) {
      // The record changed outside this form's fields (or not at all): the
      // form is still based on current values, under the newer token.
      synced.current.updatedAt = updatedAt;
      return;
    }
    if (isDirty) return;
    form.reset(JSON.parse(snapshot) as T);
    synced.current = { snapshot, updatedAt };
  }, [snapshot, updatedAt, isDirty, form]);

  return () => synced.current?.updatedAt;
}
