import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** An app's sign-in the consent page answers: which app asks, where it sends the user back, what it asks for. */
export function oauthAuthorizationQuery(id: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.auth.oauthAuthorization(id),
    queryFn: () => parseResponse(rpc.auth.oauth.authorizations[":id"].$get({ param: { id } })),
    // Answered once: a page opened again reads it afresh, gone (a 404) once it was answered
    gcTime: NO_TIME,
    retry: false,
  });
}
