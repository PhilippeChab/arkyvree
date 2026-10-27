import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";

import { findSignedIn, getSessionCookie } from "@/server/middlewares/index.ts";
import { BUILD_ID, Connections } from "@/server/websockets/index.ts";

export default new Hono().get(
  "/ws",
  upgradeWebSocket((c) => {
    let userId: string | null = null;

    return {
      async onOpen(_event, ws) {
        // The session a request takes, refused as a request's is (an expired demo user's among them)
        const signedIn = await findSignedIn(getSessionCookie(c));
        if (!signedIn) {
          ws.close(4001, "Unauthorized");
          return;
        }

        userId = signedIn.user.id;
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
