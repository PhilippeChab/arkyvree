import { Client as PgClient } from "pg";

import { readEnv } from "@/server/environment.ts";
import type { WsEvent } from "@/shared/webSocketEvents.ts";

import Connections from "./Connections.ts";
import { BROADCAST_CHANNEL } from "./events.ts";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * The process's Postgres listener on the broadcast channel, which pushes each event it relays to this process's sockets
 * (`Connections`). It reconnects when its connection drops or stops answering its heartbeat, backing off up to 30s.
 */
class BroadcastListener {
  private attempt = 0;

  private client: PgClient | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private stopping = false;

  private clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.stopping || this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.attempt, 30_000);
    console.warn(`[ws] Listen client disconnected — reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startHeartbeat(client: PgClient) {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          client.query("SELECT 1"),
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(() => reject(new Error("heartbeat timeout")), HEARTBEAT_TIMEOUT_MS);
          }),
        ]);
        if (timeoutHandle) clearTimeout(timeoutHandle);
      } catch (error) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.warn("[ws] Heartbeat failed — forcing reconnect:", error instanceof Error ? error.message : error);
        this.clearHeartbeat();
        this.client = null;
        client.removeAllListeners();
        client.end().catch(() => {});
        this.scheduleReconnect();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;

    // LISTEN/NOTIFY requires a direct connection. Neon's PgBouncer pooler doesn't
    // support session-level features. Prefer DIRECT_DATABASE_URL when set,
    // otherwise strip `-pooler` from DATABASE_URL as a fallback.
    const rawUrl = readEnv("DIRECT_DATABASE_URL") || readEnv("DATABASE_URL") || "";
    const connectionString = rawUrl.replace("-pooler", "");
    const client = new PgClient({ connectionString });
    client.on("error", (err) => {
      console.error("[ws] Listen client error:", err.message);
      this.scheduleReconnect();
    });
    client.on("end", () => {
      this.clearHeartbeat();
      this.scheduleReconnect();
    });
    client.on("notification", (msg) => {
      if (msg.channel !== BROADCAST_CHANNEL || !msg.payload) return;
      try {
        const { userId, event } = JSON.parse(msg.payload) as { event: WsEvent; userId: string };
        Connections.send(userId, event);
      } catch (error) {
        console.error("[ws] Failed to parse broadcast payload:", error);
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${BROADCAST_CHANNEL}`);
      this.client = client;
      this.startHeartbeat(client);
      const wasReconnect = this.attempt > 0;
      this.attempt = 0;
      console.log(wasReconnect ? "[ws] Broadcast listener reconnected" : "[ws] Broadcast listener started");
    } catch (error) {
      console.error("[ws] Failed to connect listener:", error);
      this.attempt++;
      this.scheduleReconnect();
    }
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.attempt = 0;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}

export default new BroadcastListener();
