/** What the instance's admins read: its sign-up setting, and its accounts a page at a time. */

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { nextPage } from "@/client/src/lib/pageItems.ts";
import { LIST_PAGE_SIZE } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The instance's accounts, the newest first, those whose address or username holds `search`. */
export function adminAccountsQuery(search: string) {
  return infiniteQueryOptions({
    queryKey: QUERY_KEYS.admin.accounts(search),
    queryFn: ({ pageParam }) =>
      parseResponse(
        rpc.api.admin.accounts.$get({
          query: { page: pageParam.toString(), limit: LIST_PAGE_SIZE.toString(), search: search || undefined },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

/** Who may make an account on the instance. */
export function adminSettingsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.admin.settings,
    queryFn: () => parseResponse(rpc.api.admin.settings.$get()),
  });
}
