import { queryOptions } from "@tanstack/react-query";

import { INVITE_KINDS, type InviteKind } from "@/client/src/components/invites/index.ts";
import { NO_TIME } from "@/client/src/lib/durations.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

/** An invite its page answers, as its kind reads it (`inviteFn`), or null once it's gone (a 404). */
export function inviteQuery(kind: InviteKind, inviteId: string) {
  return queryOptions({
    queryKey: QUERY_KEYS.invites.detail(kind, inviteId),
    queryFn: async () => {
      try {
        return await INVITE_KINDS[kind].inviteFn(inviteId);
      } catch (error) {
        // Revoked, or addressed to someone else.
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    // Drop the invite once the page closes: it may be answered elsewhere (the
    // bell, the dashboard), and a cached "Pending" would offer dead buttons.
    gcTime: NO_TIME,
  });
}
