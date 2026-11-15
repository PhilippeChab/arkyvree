import { useState } from "react";

import { useSearchParam } from "@/client/src/hooks/index.ts";
import { readInviteToken, saveInviteToken } from "@/client/src/stores/inviteLinkStorage.ts";

/**
 * Keeps the token of the invite link the page was opened through (`token`, its `?invite=…`) for the tab, and takes it
 * out of the address bar (`history.replaceState`), so it's neither in the history nor in an error report's URL. Its
 * page reads it once, as it mounts: the router's own copy of the address is left as it is, which nothing reads again.
 */
function keepInviteToken(token: string) {
  saveInviteToken(token);
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The token of the invite link the tab was opened through: read once off the address (`?invite=…`) and kept for the
 * tab (`keepInviteToken`). A page the visitor goes to and back from (sign-in, then sign-up) reads it again from the tab.
 */
export function useInviteToken() {
  const { value } = useSearchParam("invite");
  const [token] = useState(() => {
    if (value) keepInviteToken(value);
    return value || readInviteToken() || undefined;
  });
  return token;
}
