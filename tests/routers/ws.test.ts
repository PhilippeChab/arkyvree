import { afterAll, describe, expect, test } from "bun:test";

import { Hono } from "hono";
import { websocket } from "hono/bun";

import { SESSION_COOKIE_NAME } from "@/server/middlewares/session.ts";
import wsRouter from "@/server/routers/ws.ts";
import { createSignedInUser } from "@/tests/support/users.ts";

/** Bun's WebSocket client, which sends headers: the DOM's type, which the project's libraries bring, takes none. */
const BunWebSocket = WebSocket as unknown as new (url: string, options: Bun.WebSocketOptions) => WebSocket;

const PAST = new Date(Date.now() - 60_000).toISOString();

const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: new Hono().route("/", wsRouter).fetch, websocket });
/** The first thing the socket does once opened with `cookie`: its first message, or its close code. */
async function openWith(cookie: string): Promise<{ closed?: number; message?: string }> {
  const socket = new BunWebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { cookie } });
  return await new Promise((resolve) => {
    socket.onmessage = (event) => {
      resolve({ message: String(event.data) });
      socket.close();
    };
    socket.onclose = (event) => resolve({ closed: event.code });
  });
}

describe("ws", () => {
  afterAll(() => server.stop(true));

  test("opens for a signed-in user, telling them the build", async () => {
    const opened = await openWith(`${SESSION_COOKIE_NAME}=${(await createSignedInUser({ prefix: "ws" })).session.id}`);
    expect(JSON.parse(opened.message!)).toMatchObject({ type: "app:version" });
  });

  test("refuses an expired demo user's live session, as a request is refused", async () => {
    expect(
      await openWith(
        `${SESSION_COOKIE_NAME}=${(await createSignedInUser({ prefix: "ws", expiresAt: PAST })).session.id}`,
      ),
    ).toEqual({ closed: 4001 });
  });

  test("refuses a cookie that holds no session's id", async () => {
    expect(await openWith(`${SESSION_COOKIE_NAME}=not-a-session-id`)).toEqual({ closed: 4001 });
  });
});
