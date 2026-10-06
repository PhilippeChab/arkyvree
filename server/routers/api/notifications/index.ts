import { Hono } from "hono";
import { z } from "zod";

import { sessionMiddleware, validate } from "@/server/middlewares/index.ts";
import { idParam, limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { NotificationsService } from "@/server/services/notifications/index.ts";

export default new Hono()
  .use(sessionMiddleware)
  .get(
    "/",
    validate(
      "query",
      z.object({
        limit,
        page,
        unreadOnly: z
          .string()
          .transform((v) => v === "true")
          .optional(),
        search: z.string().optional(),
        orderDir: orderDirDesc,
      }),
    ),
    async (c) => {
      const { unreadOnly, search, orderDir, limit, page } = c.req.valid("query");
      return c.json(
        await NotificationsService.getNotifications(
          c.var.requestSession,
          { unreadOnly, search, orderDir },
          { limit, page },
        ),
        200,
      );
    },
  )
  .get("/unread", async (c) => {
    return c.json(await NotificationsService.getUnreadSummary(c.var.requestSession), 200);
  })
  .post("/read-all", async (c) => {
    await NotificationsService.markAllRead(c.var.requestSession);
    return c.json({ success: true }, 200);
  })
  .post("/:id/read", validate("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await NotificationsService.markRead(c.var.requestSession, id), 200);
  });
