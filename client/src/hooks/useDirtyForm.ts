import { useEffect } from "react";

import { useDirtyFormsStore } from "@/client/src/stores/dirtyFormsStore.ts";

/**
 * Register a form's dirty state with the global tracker. While `isDirty`
 * is true, the page will warn before reload (custom confirm in the
 * Refresh-banner action and a native beforeunload prompt for tab
 * close / browser refresh).
 *
 * `FormDialog` calls this automatically. Inline forms (e.g.,
 * CharacterIdentitySection's identity form) can opt in by calling it
 * with `form.formState.isDirty`.
 */
export function useDirtyForm(isDirty: boolean): void {
  const increment = useDirtyFormsStore((s) => s.increment);
  const decrement = useDirtyFormsStore((s) => s.decrement);

  useEffect(() => {
    if (!isDirty) return;
    increment();
    return () => decrement();
  }, [isDirty, increment, decrement]);
}
