import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The user's five latest notifications, for the dashboard. */
export function recentNotificationsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.notifications.list({ limit: 5, page: 1 }),
    queryFn: () => parseResponse(rpc.api.notifications.$get({ query: { limit: "5", page: "1" } })),
  });
}
