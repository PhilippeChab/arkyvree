/** The shared sheet's query: a character as its share link shows it to anyone who has the link. */

import { queryOptions, skipToken } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The character a share link shows; skipped while the link has no token. */
export function sharedCharacterQuery(shareToken: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.shared.character(shareToken),
    queryFn: shareToken
      ? () => parseResponse(rpc.api.shared.characters[":shareToken"].$get({ param: { shareToken } }))
      : skipToken,
  });
}
