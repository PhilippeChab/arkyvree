import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

import { useLatest } from "./useLatest.ts";

/**
 * Keep an edit form showing the latest server values. The form is reset only
 * when those values change and it has no unsaved edits, so a background
 * refetch (window focus, another section's mutation) never wipes what the user
 * is typing. Pass `undefined` while the data is loading.
 *
 * After a save, call `form.reset(submitted)`: that clears the dirty state
 * without this hook re-applying the pre-save values, and the refetched data
 * takes over once it arrives.
 */
export function useFormSync<T extends FieldValues>(form: UseFormReturn<T>, values: NoInfer<T> | undefined): void {
  const isDirty = useLatest(form.formState.isDirty);
  // Compare by content: a refetch returns new objects even when nothing changed.
  const snapshot = values === undefined ? undefined : JSON.stringify(values);

  useEffect(() => {
    if (snapshot === undefined || isDirty.current) return;
    form.reset(JSON.parse(snapshot) as T);
  }, [snapshot, isDirty, form]);
}
