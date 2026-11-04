import { useEffect } from "react";

import { useDirtyFormsStore } from "@/client/src/stores/dirtyFormsStore.ts";

/**
 * Register a form's dirty state with the global tracker. While `isDirty`
 * is true, the page will warn before reload (the browser's beforeunload
 * prompt, for a closed tab, a browser refresh or the new version's
 * Refresh).
 *
 * `FormDialog` calls this for a dialog's form, and `useFormSync` for an
 * inline form's: nothing else does (`arkyvree/dirty-forms`).
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
