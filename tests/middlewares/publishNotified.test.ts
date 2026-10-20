import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { Hono } from "hono";

import publishNotified from "@/server/middlewares/publishNotified.ts";
import * as events from "@/server/websockets/events.ts";
import { noteNotified } from "@/server/websockets/index.ts";

/** An app behind the middleware whose user is `userId`, its routes noting `notified` and answering `status`. */
function behind(userId: string, notified: string[], status: 200 | 400 = 200) {
  return new Hono<{ Variables: { requestSession: { userId: string } } }>()
    .use(async (c, next) => {
      c.set("requestSession", { userId });
      await next();
    })
    .use(publishNotified)
    .on(["GET", "POST"], "/", (c) => {
      noteNotified(notified);
      return c.json({}, status);
    });
}

afterEach(() => {
  spyOn(events, "publishWsEvent").mockRestore();
});

describe("publishNotified", () => {
  test("tells whom a write notified, and its user that their activities changed", async () => {
    const publish = spyOn(events, "publishWsEvent").mockResolvedValue(undefined);
    await behind("writer", ["invitee"]).request("/", { method: "POST" });
    expect(publish.mock.calls).toEqual([
      ["invitee", { type: "notifications:updated" }],
      ["writer", { type: "activities:updated" }],
    ]);
  });

  test("tells no one of a read, or of a write that failed", async () => {
    const publish = spyOn(events, "publishWsEvent").mockResolvedValue(undefined);
    await behind("reader", ["someone"]).request("/");
    await behind("writer", ["someone"], 400).request("/", { method: "POST" });
    expect(publish).not.toHaveBeenCalled();
  });
});
