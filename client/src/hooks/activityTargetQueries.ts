/** Where an activity's or a notification's target is now, which `useOpenActivityTarget` alone asks. */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** Where an activity's or a notification's target is now: the server resolves its page as it's opened. */
export function activityTargetQuery(targetTable: string, targetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.activities.target(targetTable, targetId),
    queryFn: () =>
      parseResponse(rpc.api.activities.resolve[":targetTable"][":targetId"].$get({ param: { targetTable, targetId } })),
  });
}
