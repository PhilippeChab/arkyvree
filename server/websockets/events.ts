import { db, notifyChannel } from "@/server/database/index.ts";
import type { WsEvent } from "@/shared/webSocketEvents.ts";

/**
 * The Postgres channel that relays an event to every process (each web instance, and the worker), which pushes it to
 * the sockets it holds. Payload: JSON `{ userId, event }`.
 */
export const BROADCAST_CHANNEL = "ws_broadcast";

/**
 * Pushes an event to every socket `userId` has open, whichever process holds it: through Postgres, which every web
 * instance listens on (`BroadcastListener`). Call it once the transaction that changed the state commits.
 */
export async function publishWsEvent(userId: string, event: WsEvent) {
  const payload = JSON.stringify({ userId, event });
  await notifyChannel(db, BROADCAST_CHANNEL, payload);
}
