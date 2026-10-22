import { createMiddleware } from "hono/factory";

import { collectNotified, publishWsEvent } from "@/server/websockets/index.ts";

import type { SessionContext } from "./session.ts";

/**
 * Records whom a write of the app's API or of the public API notified, and tells them over the websocket once it
 * succeeds, and its user that their activities changed: the open app shows it, whichever API made it.
 */
export default createMiddleware<{ Variables: Partial<SessionContext["Variables"]> }>(async (c, next) => {
  const notified = await collectNotified(next);
  if (!["POST", "PUT", "DELETE"].includes(c.req.method) || !c.res.ok) return;
  const publish = (userId: string, type: "activities:updated" | "notifications:updated") =>
    publishWsEvent(userId, { type }).catch((error) => console.error("[ws] Failed to publish event:", error));
  for (const userId of notified) publish(userId, "notifications:updated");
  const session = c.get("requestSession");
  if (session) publish(session.userId, "activities:updated");
});
