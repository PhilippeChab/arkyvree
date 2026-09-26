import { useNavigate } from "react-router-dom";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { ApiError, parseResponse, rpc } from "@/client/src/services/rpc.ts";

// Activities about accounts and sessions have no page to open.
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

  return async (targetTable: string, targetId: string) => {
    try {
      const { url } = await parseResponse(rpc.api.activities.resolve[":targetTable"][":targetId"].$get({
        param: { targetTable, targetId },
      }));
      navigate(url);
    } catch (error) {
      // 403 says why ("You no longer have access to this character.");
      // anything else means the entity is gone.
      snackbar.warning(error instanceof ApiError && error.status === 403
        ? error.message
        : "This item has been deleted and is no longer available.");
    }
  };
}
