import { queryOptions } from "@tanstack/react-query";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import type { InviteKind } from "@/client/src/lib/invites.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

/** An invite a landing page answers: what `inviteFn` reads of it, or null once it's gone (a 404). */
export function inviteQuery<T>(kind: InviteKind, inviteId: string, inviteFn: () => Promise<T>) {
  return queryOptions({
    queryKey: QUERY_KEYS.invites.detail(kind, inviteId),
    queryFn: async () => {
      try {
        return await inviteFn();
      } catch (err) {
        // Revoked, or addressed to someone else.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    // Drop the invite once the page closes: it may be answered elsewhere (the
    // bell, the dashboard), and a cached "Pending" would offer dead buttons.
    gcTime: NO_TIME,
  });
}
