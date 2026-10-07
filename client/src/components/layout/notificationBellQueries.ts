import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The unread notifications the bell counts and lists. */
export function unreadNotificationsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.notifications.unreadCount,
    queryFn: () => parseResponse(rpc.api.notifications.unread.$get()),
  });
}
