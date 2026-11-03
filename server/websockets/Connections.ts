import type { WSContext } from "hono/ws";

import type { WsEvent } from "@/shared/webSocketEvents.ts";

/** The sockets this process holds, by user. */
class Connections {
  private readonly byUser = new Map<string, Set<WSContext>>();

  add(userId: string, ws: WSContext) {
    let sockets = this.byUser.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.byUser.set(userId, sockets);
    }
    sockets.add(ws);
  }

  remove(userId: string, ws: WSContext) {
    const sockets = this.byUser.get(userId);
    if (!sockets) return;
    sockets.delete(ws);
    if (sockets.size === 0) this.byUser.delete(userId);
  }

  /**
   * Pushes an event to the sockets of `userId` this process holds. Only the broadcast listener calls it: everything
   * else publishes (`publishWsEvent`), reaching every process's sockets.
   */
  send(userId: string, event: WsEvent) {
    const sockets = this.byUser.get(userId);
    if (!sockets) return;
    const payload = JSON.stringify(event);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {
        // Connection dead — will be cleaned up on close
      }
    }
  }
}

export default new Connections();
