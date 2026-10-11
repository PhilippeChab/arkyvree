import { infiniteQueryOptions } from "@tanstack/react-query";
import { type InferRequestType, parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { type Direction, LIST_PAGE_SIZE } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

type ActivityListParams = InferRequestType<typeof rpc.api.activities.$get>["query"];

export interface ActivityListFilters {
  orderBy: NonNullable<ActivityListParams["orderBy"]>;
  orderDir: Direction;
  search: string;
}

/** The activity log, a page at a time. */
export function activityListQuery(filters: ActivityListFilters) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.activities.list({ ...filters }),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.activities.$get({
          query: {
            page: pageParam.toString(),
            limit: LIST_PAGE_SIZE.toString(),
            search: filters.search || undefined,
            orderBy: filters.orderBy,
            orderDir: filters.orderDir,
          },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}
