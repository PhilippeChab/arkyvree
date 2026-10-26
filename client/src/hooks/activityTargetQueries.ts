/** Where an activity's or a notification's target is now, which `useOpenActivityTarget` alone asks. */

import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** Where an activity's or a notification's target is now: the server resolves its page as it's opened. */
export function activityTargetQuery(targetType: string, targetId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.activities.target(targetType, targetId),
    queryFn: () =>
      parseResponse(rpc.api.activities.resolve[":targetType"][":targetId"].$get({ param: { targetType, targetId } })),
  });
}
