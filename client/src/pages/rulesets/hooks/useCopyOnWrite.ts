import { useLocation, useNavigate } from "react-router-dom";

import { entityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";

/**
 * A ruleset entity's page following a copy-on-write: editing or customizing an inherited entity copies it into the
 * ruleset under a new id, and `followCopy` moves the page to the copy, on the tab it shows, unless it has left the
 * entity since. The page's router state says where the copy came from (`copiedFrom`) until the copy's own data is in:
 * the form keyed `key` adopts the source's `adoptKey` and keeps its unsaved edits, then `forgetSource` drops it.
 * `pathOf` is an entity's page under the ruleset ("classes/:id").
 */
export function useCopyOnWrite(rulesetId: string, entityId: string, pathOf: (entityId: string) => string) {
  const navigate = useNavigate();
  const location = useLocation();
  const state = entityPageState(location.state);
  const { copiedFrom, ...stateAfterCopy } = state;

  const followCopy = (copyId: string, sourceId: string) => {
    const sourcePath = `/rulesets/${rulesetId}/${pathOf(sourceId)}`;
    if (copyId === sourceId || !isStillOpen(sourcePath)) return;
    // Onto the tab shown now, which may have changed while the request ran
    navigate(`/rulesets/${rulesetId}/${pathOf(copyId)}${window.location.pathname.slice(sourcePath.length)}`, {
      replace: true,
      state: { ...state, copiedFrom: sourceId },
    });
  };

  // Once the copy's own data is in (`loaded`), the same address without its source, so going back and forth in history
  // never carries edits between the two. A navigation still loading has moved the address bar on: leave it be.
  const forgetSource = (loaded: boolean) =>
    copiedFrom && loaded && window.location.pathname === location.pathname
      ? { to: `${location.pathname}${location.search}${location.hash}`, state: stateAfterCopy }
      : undefined;

  return {
    // An inherited entity keeps its id in every fork: the form's key names the ruleset too
    adoptKey: copiedFrom && `${rulesetId}/${copiedFrom}`,
    copiedFrom,
    followCopy,
    forgetSource,
    key: `${rulesetId}/${entityId}`,
  };
}
