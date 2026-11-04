import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { KEPT_SCROLL } from "@/client/src/lib/keptScroll.ts";
import { seedCopyQueries } from "@/client/src/pages/rulesets/copyQueries.ts";
import { entityPageState } from "@/client/src/pages/rulesets/entityPageState.ts";
import { isStillOpen } from "@/client/src/pages/rulesets/stillOpen.ts";

/**
 * A ruleset entity's page following a copy-on-write: editing or customizing an inherited entity copies it into the
 * ruleset under a new id, and `followCopy` moves the page to the copy, on the tab it shows, unless it has left the
 * entity since. The page stays as it is as it moves, where it's scrolled to (`KEPT_SCROLL`), and what it shows: the
 * source's queries are the copy's until its own rows are in (`seedCopyQueries`). The page's router state says where the
 * copy came from (`copiedFrom`) until the copy's data is in: the form keyed `key` adopts the source's `adoptKey` and
 * keeps its unsaved edits, then `forgetSource` drops it.
 * `pathOf` is an entity's page under the ruleset ("classes/:id").
 */
export function useCopyOnWrite(rulesetId: string, entityId: string, pathOf: (entityId: string) => string) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = entityPageState(location.state);
  const { copiedFrom, ...stateAfterCopy } = state;

  const followCopy = (copyId: string, sourceId: string) => {
    const sourcePath = `/rulesets/${rulesetId}/${pathOf(sourceId)}`;
    if (copyId === sourceId || !isStillOpen(sourcePath)) return;
    seedCopyQueries(queryClient, rulesetId, sourceId, copyId);
    // Onto the tab shown now, which may have changed while the request ran, as it shows (its search: a table's)
    const tab = window.location.pathname.slice(sourcePath.length);
    navigate(`/rulesets/${rulesetId}/${pathOf(copyId)}${tab}${window.location.search}`, {
      replace: true,
      state: { ...state, copiedFrom: sourceId, ...KEPT_SCROLL },
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
