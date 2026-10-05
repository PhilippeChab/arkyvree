/**
 * The app's WebSockets: the sockets each process holds (`Connections`), the events pushed to them
 * (`publishWsEvent`, relayed to every process through Postgres, which each one's `BroadcastListener` listens on), and
 * the users a request notified, pushed to once it's answered (`collectNotified`).
 */
import { upgradeWebSocket, websocket } from "hono/bun";

/** This server build's id, which a socket gets when it opens: a client seeing a new one offers a refresh. */
export const BUILD_ID = Date.now().toString();

export { default as BroadcastListener } from "./BroadcastListener.ts";
export { default as Connections } from "./Connections.ts";
export { publishWsEvent } from "./events.ts";
export { collectNotified, noteNotified } from "./notifiedUsers.ts";
export { upgradeWebSocket, websocket };
