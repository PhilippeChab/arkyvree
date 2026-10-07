import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { activityTargetQuery } from "@/client/src/lib/queries.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

/** Activities about accounts and sessions have no page to open. */
const NON_NAVIGABLE_TABLES = new Set(["users", "sessions"]);

/** Whether an activity or notification target has a page to open. */
export function isNavigableTarget(targetTable: string): boolean {
  return !NON_NAVIGABLE_TABLES.has(targetTable);
}

/**
 * Open the page of an activity or notification target. The link is resolved
 * server-side at click time, since the entity may have moved (COW copies),
 * been deleted, or become inaccessible since the activity was recorded.
 */
export function useOpenActivityTarget() {
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  return (targetTable: string, targetId: string) => {
    queryClient.fetchQuery({ ...activityTargetQuery(targetTable, targetId), staleTime: NO_TIME }).then(
      ({ url }) => navigate(url),
      // A 403 says why ("You no longer have access to this character."), a 404 that the entity is gone; any other
      // failure (the server's, the network's) is an error of its own
      (error) => {
        if (error instanceof ApiError && error.status === 403)
          snackbar.warning(errorMessage(error, "You no longer have access to this item"));
        else if (error instanceof ApiError && error.status === 404) snackbar.warning("This item was deleted");
        else snackbar.error(error, "Failed to open this item");
      },
    );
  };
}
