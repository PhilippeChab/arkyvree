import { isRecord } from "./isRecord.ts";

/**
 * An event the server pushes to a user's sockets (`publishWsEvent`): what changed for them, which the client refreshes
 * (`WebSocketProvider`), or the version the app runs, which a new deploy changes.
 */
export type WsEvent =
  | { type: "activities:updated" }
  | { type: "notifications:updated" }
  | { type: "app:version"; version: string };

/** Whether a message read off a socket is one of the server's events: anything else is ignored. */
export function isWsEvent(value: unknown): value is WsEvent {
  if (!isRecord(value)) return false;
  if (value.type === "app:version") return typeof value.version === "string";
  return value.type === "activities:updated" || value.type === "notifications:updated";
}
