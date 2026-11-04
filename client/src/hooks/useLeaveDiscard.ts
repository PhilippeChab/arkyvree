import { useEffect } from "react";
import { type Location, useBlocker } from "react-router-dom";

import { useDirtyForm } from "./useDirtyForm.ts";

/**
 * A page's unsaved changes (`unsaved`) outside a form: a reload or a closed tab asks first, in the browser's own prompt,
 * as a form's do (`useDirtyForm`), and leaving the page in the app drops them (`discard`), but for an address that is
 * still the page (`stays`: its tabs). No dialog asks before: the browser's prompt is the app's one.
 */
export function useLeaveDiscard(unsaved: boolean, stays: (next: Location) => boolean, discard: () => void) {
  useDirtyForm(unsaved);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved && currentLocation.pathname !== nextLocation.pathname && !stays(nextLocation),
  );
  // Held only to drop them on the way out
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    discard();
    blocker.proceed();
  }, [blocker, discard]);
}
