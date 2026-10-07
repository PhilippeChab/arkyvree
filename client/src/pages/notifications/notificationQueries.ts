import { infiniteQueryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { type Direction, LIST_PAGE_SIZE } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export interface NotificationListFilters {
  orderDir: Direction;
  search: string;
  unreadOnly: boolean;
}

/** The user's notifications, a page at a time. */
export function notificationListQuery(filters: NotificationListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.notifications.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.notifications.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            search: filters.search || undefined,
            orderDir: filters.orderDir,
            unreadOnly: filters.unreadOnly ? "true" : undefined,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
