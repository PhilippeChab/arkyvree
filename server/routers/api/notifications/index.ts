import { toJson } from "@/server/errors/index.ts";
import { sessionMiddleware } from "@/server/middlewares/index.ts";
import NotificationsService from "@/server/services/NotificationsService.ts";
import { limit, orderDirDesc, page } from "@/server/routers/api/validation.ts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

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
      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  )
  .get("/unread", async (c) => {
    const result = await NotificationsService.initialize().call(
      "getUnreadSummary",
      c.var.requestSession,
    );
    const success = result[0];
    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }
    return c.json(result[1], 200);
  })
  .post(
    "/:id/read",
    zValidator("param", z.object({ id: z.string().uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const result = await NotificationsService.initialize().call(
        "markRead",
        c.var.requestSession,
        id,
      );
      const success = result[0];
      if (!success) {
        const [error, code] = toJson(result[2]);
        return c.json(error, code);
      }
      return c.json(result[1], 200);
    },
  )
  .post("/read-all", async (c) => {
    const result = await NotificationsService.initialize().call(
      "markAllRead",
      c.var.requestSession,
    );
    const success = result[0];
    if (!success) {
      const [error, code] = toJson(result[2]);
      return c.json(error, code);
    }
    return c.json({ success: true }, 200);
  });

export default notifications;
