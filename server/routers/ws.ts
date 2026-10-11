import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { getCookie } from "hono/cookie";

import { db } from "@/server/database/index.ts";
import { SESSION_COOKIE_NAME } from "@/server/middlewares/index.ts";
import { Sessions, Users } from "@/server/repositories/index.ts";
import { BUILD_ID, Connections } from "@/server/websockets/index.ts";

export default new Hono().get(
  "/ws",
  upgradeWebSocket((c) => {
    let userId: string | null = null;

    return {
      async onOpen(_event, ws) {
        const sessionId = getCookie(c, SESSION_COOKIE_NAME);
        if (!sessionId) {
          ws.close(4001, "Unauthorized");
          return;
        }

        const session = await Sessions.findOne(db, { id: sessionId });
        if (!session || new Date(session.expiresAt) < new Date()) {
          ws.close(4001, "Unauthorized");
          return;
        }

        const user = await Users.findOne(db, { id: session.userId });
        if (!user) {
          ws.close(4001, "Unauthorized");
          return;
        }

        userId = user.id;
        Connections.add(userId, ws);
        ws.send(JSON.stringify({ type: "app:version", version: BUILD_ID }));
      },
      onMessage(event, ws) {
        if (event.data === "ping") ws.send("pong");
      },
      onClose(_event, ws) {
        if (userId) Connections.remove(userId, ws);
      },
    };
  }),
);
