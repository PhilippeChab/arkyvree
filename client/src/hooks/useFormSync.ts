import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

/**
 * Keep an edit form showing the latest server values. The form is reset only
 * when those values change and it has no unsaved edits, so a background
 * refetch (window focus, another section's mutation) never wipes what the user
 * is typing. Pass `undefined` while the data is loading.
 */
export function useFormSync<T extends FieldValues>(form: UseFormReturn<T>, values: NoInfer<T> | undefined): void {
  const { isDirty } = form.formState;
  // Compare by content: a refetch returns new objects even when nothing changed.
  const snapshot = values === undefined ? undefined : JSON.stringify(values);

  useEffect(() => {
    if (snapshot === undefined || isDirty) return;
    form.reset(JSON.parse(snapshot) as T);
  }, [snapshot, isDirty, form]);
}
