import { queryOptions } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/** The modifiers set on a character itself, which its Modifiers dialog lists. */
export function characterModifiersQuery(characterId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.characters.modifiers(characterId),
    queryFn: () =>
      parseResponse(rpc.api.characters.modifiers[":characterId"].modifiers.$get({ param: { characterId } })),
  });
}
