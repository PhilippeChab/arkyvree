import { type QueryKey, queryOptions } from "@tanstack/react-query";

import { NO_TIME } from "@/client/src/lib/durations.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";

/** An invite a landing page answers: what `inviteFn` reads of it, or null once it's gone (a 404). */
export function inviteQuery<T>(queryKey: QueryKey, inviteFn: () => Promise<T>) {
  return queryOptions({
    queryKey,
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
