import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The apps the user connected to the MCP server (Claude, ChatGPT): the newest first. */
export function connectedAppsQuery() {
  return queryOptions({
    queryKey: QUERY_KEYS.auth.connectedApps,
    queryFn: () => parseResponse(rpc.auth["connected-apps"].$get()),
  });
}
