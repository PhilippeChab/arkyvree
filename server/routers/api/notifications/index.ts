import { Hono } from "hono";
import { z } from "zod";

import { sessionMiddleware, zValidator } from "@/server/middlewares/index.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { errorResponse, respond } from "@/server/routers/respond.ts";
import NotificationsService from "@/server/services/NotificationsService.ts";

const notifications = new Hono()
  .use(sessionMiddleware)
  .get(
    "/",
    zValidator(
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
      const query = c.req.valid("query");

      const result = await NotificationsService.initialize().call(
        "getNotifications",
        c.var.requestSession,
        { unreadOnly: query.unreadOnly, search: query.search, orderDir: query.orderDir },
        { limit: query.limit, page: query.page },
      );
      return respond(c, result, 200);
    },
  )
  .get("/unread", async (c) => {
    const result = await NotificationsService.initialize().call("getUnreadSummary", c.var.requestSession);
    return respond(c, result, 200);
  })
  .post("/:id/read", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid("param");
    const result = await NotificationsService.initialize().call("markRead", c.var.requestSession, id);
    return respond(c, result, 200);
  })
  .post("/read-all", async (c) => {
    const result = await NotificationsService.initialize().call("markAllRead", c.var.requestSession);
    const success = result[0];
    if (!success) return errorResponse(c, result[2]);
    return c.json({ success: true }, 200);
  });

export default notifications;
