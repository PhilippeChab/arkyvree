import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The user's API keys, which act as them on the public API: the newest first. */
export function apiKeysQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.auth.apiKeys,
    queryFn: () => parseResponse(rpc.auth["api-keys"].$get()),
  });
}
