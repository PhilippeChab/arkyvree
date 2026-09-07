import { upgradeWebSocket, websocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { Client as PgClient } from "pg";

import { and, eq, gte, sql } from "drizzle-orm";

import { notificationsInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";

export type WsEvent =
  | { type: "activities:updated" }
  | { type: "notifications:updated" }
  | { type: "app:version"; version: string };

export const BUILD_ID = Date.now().toString();

export { upgradeWebSocket, websocket };

// userId -> Set of active WebSocket connections
const connections = new Map<string, Set<WSContext>>();

export function addConnection(userId: string, ws: WSContext) {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(ws);
}

export function removeConnection(userId: string, ws: WSContext) {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connections.delete(userId);
}

/**
 * Push an event to the local in-memory WebSocket connections for `userId`.
 * Only called by the LISTEN handler. Every caller outside this file should
 * use `publishWsEvent` instead — it routes through Postgres so all web
 * instances (and the worker) broadcast through the same channel.
 */
function broadcast(userId: string, event: WsEvent) {
  const set = connections.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const ws of set) {
    try {
      ws.send(payload);
    } catch {
      // Connection dead — will be cleaned up on close
    }
  }
}

/**
 * Channel used to relay WebSocket broadcast requests between processes
 * (any web instance or the worker) via Postgres LISTEN/NOTIFY.
 * Payload: JSON `{ userId, event }`.
 */
export const BROADCAST_CHANNEL = "ws_broadcast";

/**
 * Publish a WebSocket event to all connected sockets for `userId`, regardless
 * of which process they're connected to. Every web instance LISTENs on the
 * broadcast channel and fans the event out to its local connections.
 * Call this AFTER the transaction that produced the state change commits.
 */
export async function publishWsEvent(userId: string, event: WsEvent) {
  const payload = JSON.stringify({ userId, event });
  await db.execute(sql`SELECT pg_notify(${BROADCAST_CHANNEL}, ${payload})`);
}

let listenClient: PgClient | null = null;
let shuttingDownListener = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let currentAttempt = 0;

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function scheduleReconnect() {
  if (shuttingDownListener || reconnectTimer) return;
  const delay = Math.min(1000 * 2 ** currentAttempt, 30_000);
  console.warn(`[ws] Listen client disconnected — reconnecting in ${delay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectListener();
  }, delay);
}

function startHeartbeat(client: PgClient) {
  clearHeartbeat();
  heartbeatTimer = setInterval(async () => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        client.query("SELECT 1"),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error("heartbeat timeout")), HEARTBEAT_TIMEOUT_MS);
        }),
      ]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
    } catch (err) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.warn("[ws] Heartbeat failed — forcing reconnect:", err instanceof Error ? err.message : err);
      clearHeartbeat();
      listenClient = null;
      client.removeAllListeners();
      client.end().catch(() => {});
      scheduleReconnect();
    }
  }, HEARTBEAT_INTERVAL_MS);
}

async function connectListener(): Promise<void> {
  if (shuttingDownListener) return;

  // LISTEN/NOTIFY requires a direct connection. Neon's PgBouncer pooler doesn't
  // support session-level features. Prefer DIRECT_DATABASE_URL when set,
  // otherwise strip `-pooler` from DATABASE_URL as a fallback.
  const rawUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || "";
  const connectionString = rawUrl.replace("-pooler", "");
  const client = new PgClient({ connectionString });
  client.on("error", (err) => {
    console.error("[ws] Listen client error:", err.message);
    scheduleReconnect();
  });
  client.on("end", () => {
    clearHeartbeat();
    scheduleReconnect();
  });
  client.on("notification", (msg) => {
    if (msg.channel !== BROADCAST_CHANNEL || !msg.payload) return;
    try {
      const { userId, event } = JSON.parse(msg.payload) as { userId: string; event: WsEvent };
      broadcast(userId, event);
    } catch (err) {
      console.error("[ws] Failed to parse broadcast payload:", err);
    }
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${BROADCAST_CHANNEL}`);
    listenClient = client;
    startHeartbeat(client);
    const wasReconnect = currentAttempt > 0;
    currentAttempt = 0;
    console.log(wasReconnect ? "[ws] Broadcast listener reconnected" : "[ws] Broadcast listener started");
  } catch (err) {
    console.error("[ws] Failed to connect listener:", err);
    currentAttempt++;
    scheduleReconnect();
  }
}

export async function startBroadcastListener(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  shuttingDownListener = false;
  currentAttempt = 0;
  await connectListener();
}

export async function stopBroadcastListener(): Promise<void> {
  shuttingDownListener = true;
  clearHeartbeat();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (listenClient) {
    await listenClient.end();
    listenClient = null;
  }
}

export function broadcastNotificationsForActor(actorId: string) {
  setTimeout(async () => {
    try {
      const twoSecondsAgo = new Date(Date.now() - 2000).toISOString();
      const recent = await db
        .selectDistinct({ recipientId: notificationsInAccount.recipientId })
        .from(notificationsInAccount)
        .where(
          and(
            eq(notificationsInAccount.actorId, actorId),
            gte(notificationsInAccount.createdAt, twoSecondsAgo),
          ),
        );
      for (const { recipientId } of recent) {
        await publishWsEvent(recipientId, { type: "notifications:updated" });
      }
    } catch {
      // Fire-and-forget — never block the response
    }
  }, 0);
}
