import { type Location, useBlocker } from "react-router-dom";

import { useDirtyForm } from "./useDirtyForm.ts";

/**
 * A page's unsaved changes (`unsaved`) guarded: a reload, a closed tab or the new version's refresh asks first, as a
 * form's do (`useDirtyForm`), and so does leaving the page in the app (`blocked`, which the page asks about: `proceed`
 * leaves, `stay` stays), but for an address that is still the page (`stays`: its tabs).
 */
export function useLeaveGuard(unsaved: boolean, stays: (next: Location) => boolean) {
  useDirtyForm(unsaved);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      unsaved && currentLocation.pathname !== nextLocation.pathname && !stays(nextLocation),
  );
  return {
    blocked: blocker.state === "blocked",
    proceed: () => blocker.proceed?.(),
    stay: () => blocker.reset?.(),
  };
}
