import { useState } from "react";

import { useSearchParam } from "@/client/src/hooks/index.ts";

/**
 * The token of the password reset link the page was opened through (`?token=…`), read once as it mounts and taken out
 * of the address bar (`history.replaceState`), so it's neither in the history nor in an error report's URL. A reload
 * loses it: the link the admin sent opens the page again.
 */
export function useResetToken() {
  const { value } = useSearchParam("token");
  const [token] = useState(() => {
    if (value) {
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", url);
    }
    return value || undefined;
  });
  return token;
}
