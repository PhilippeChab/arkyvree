import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The accounts of other providers (Google) the user signs in with. */
export function linkedAccountsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.auth.linkedAccounts,
    queryFn: () => parseResponse(rpc.auth["linked-accounts"].$get()),
  });
}
