import { db, withTransaction } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Notifications } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

const ACTIONABLE_TYPES = ["createCampaignInvite", "inviteContributor", "inviteCharacterContributor"];

class NotificationsService {
  async getNotifications(
    session: Session,
    where: {
      unreadOnly?: boolean;
      search?: string;
      orderDir?: "asc" | "desc";
    },
    pagination: { limit: number; page: number },
  ) {
    return await Notifications.findMany(db, { recipientId: session.userId, ...where }, pagination);
  }

  async getUnreadSummary(session: Session, limit = 10) {
    const [count, items] = await Promise.all([
      Notifications.count(db, { recipientId: session.userId, unread: true }),
      Notifications.findMany(
        db,
        { recipientId: session.userId, unreadOnly: true, orderDir: "desc" },
        { limit, page: 1 },
      ),
    ]);
    return { count, items: items.items };
  }

  async markAllRead(session: Session) {
    return await withTransaction(async (tx) => {
      return await Notifications.markRead(tx, {
        recipientId: session.userId,
        excludeTypes: ACTIONABLE_TYPES,
      });
    });
  }

  async markRead(session: Session, notificationId: string) {
    return await withTransaction(async (tx) => {
      const result = await Notifications.markRead(tx, {
        id: notificationId,
        recipientId: session.userId,
      });
      if (result.length === 0) {
        throw new NotFoundError("Notification not found");
      }
      return result[0];
    });
  }
}

export default new NotificationsService();
