import { Hono } from "hono";
import { z } from "zod";

import { type ApiKeyContext, describeRoute, validate } from "@/server/middlewares/index.ts";
import { idParam, orderDirDesc } from "@/server/routers/api/validation.ts";
import { v1Notification, v1NotificationPage } from "@/server/routers/v1/schemas/notifications.ts";
import { V1 } from "@/server/routers/v1/translators/V1.ts";
import { PAGE_FILTERS } from "@/server/routers/v1/validation.ts";
import { NotificationsService } from "@/server/services/notifications/index.ts";

/**
 * What the key's user is told of, from the last three months: a page of it, their unread notifications, and marking
 * them read. A PDF's (`pdfReady`) names its export (`data.exportId`).
 */
export default new Hono<ApiKeyContext>()
  .get(
    "/",
    describeRoute({
      response: v1NotificationPage,
      status: 200,
      summary: "The key's user's notifications from the last three months, a page at a time",
    }),
    validate(
      "query",
      z.object({
        ...PAGE_FILTERS,
        orderDir: orderDirDesc,
        search: z.string().optional().meta({ description: "A part of the type" }),
        unreadOnly: z.stringbool().optional().meta({ description: "Only the unread ones" }),
      }),
    ),
    async (c) => {
      const { limit, orderDir, page, search, unreadOnly } = c.req.valid("query");
      const notifications = await NotificationsService.getNotifications(
        c.var.requestSession,
        { orderDir, search, unreadOnly },
        { limit, page },
      );
      return c.json(V1.page(notifications, V1.notification), 200);
    },
  )
  .post(
    "/read-all",
    describeRoute({
      response: null,
      status: 204,
      summary: "Marks the key's user's notifications read, but invites, which stay unread until they're answered",
    }),
    async (c) => {
      await NotificationsService.markAllRead(c.var.requestSession);
      return c.body(null, 204);
    },
  )
  .post(
    "/:id/read",
    describeRoute({
      response: v1Notification,
      status: 200,
      summary: "Marks an unread notification of the key's user's read (one already read is a 404)",
    }),
    validate("param", idParam),
    async (c) => {
      const { id } = c.req.valid("param");
      return c.json(V1.notification(await NotificationsService.markRead(c.var.requestSession, id)), 200);
    },
  );
