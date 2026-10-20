/** What the key's user is told of, as v1 answers it: their notifications, each's target named by its kind. */

import type { z } from "zod";

import type { v1Notification, v1UnreadNotifications } from "@/server/routers/v1/schemas/notifications.ts";
import type { NotificationsService } from "@/server/services/notifications/index.ts";
import { isRecord } from "@/shared/isRecord.ts";

import { toV1Target } from "./activities.ts";
import type { Answer } from "./answers.ts";

/** Something the key's user is told of: in a list, or as marking it read leaves it. */
export function toV1Notification(
  notification:
    | Answer<typeof NotificationsService.getNotifications>["items"][number]
    | Answer<typeof NotificationsService.markRead>,
): z.infer<typeof v1Notification> {
  const { createdAt, data, id, readAt, type } = notification;
  const target = toV1Target(notification);
  return { createdAt, data: isRecord(data) ? data : null, id, read: readAt !== null, target, type };
}

/** The key's user's unread notifications: how many, and the latest. */
export function toV1UnreadNotifications({
  count,
  items,
}: Answer<typeof NotificationsService.getUnreadSummary>): z.infer<typeof v1UnreadNotifications> {
  return { count, items: items.map(toV1Notification) };
}
