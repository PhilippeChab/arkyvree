import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Notifications, type Pagination } from "@/server/repositories/index.ts";
import {
  type InviteAnswers,
  NO_INVITE_ANSWERS,
  readCampaignInviteAnswers,
  readCharacterInviteAnswers,
  readRulesetInviteAnswers,
} from "@/server/services/invites/index.ts";
import { withAccountWrite } from "@/server/services/writes/index.ts";
import { INVITE_NOTIFICATION_TYPES, type InviteNotificationType } from "@/shared/activity.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import type { Session } from "@/shared/relations.ts";

/** What a notification's invite is read by: its type, and the invite it's about (`targetId`). */
interface NotifiedInvite {
  targetId: string;
  type: string;
}

/** The invites the notifications of `type` name. */
function inviteIdsOf(notifications: NotifiedInvite[], type: InviteNotificationType) {
  return notifications.filter((notification) => notification.type === type).map(({ targetId }) => targetId);
}

class NotificationsService {
  /** What the session may do with each invite the notifications name, by its type and then its id. */
  private async readInviteAnswers(session: Session, notifications: NotifiedInvite[]) {
    return {
      createCampaignInvite: await readCampaignInviteAnswers(
        db,
        session,
        inviteIdsOf(notifications, "createCampaignInvite"),
      ),
      inviteCharacterContributor: await readCharacterInviteAnswers(
        db,
        session,
        inviteIdsOf(notifications, "inviteCharacterContributor"),
      ),
      inviteContributor: await readRulesetInviteAnswers(db, session, inviteIdsOf(notifications, "inviteContributor")),
    } satisfies Record<InviteNotificationType, Map<string, InviteAnswers>>;
  }

  /**
   * The notifications, an invite's carrying what the session may do with it, as its invite's page answers it
   * (`inviteAnswers`: none on a notification that isn't an invite's), each kind's read at once for them all: the bell,
   * the dashboard and the notifications page offer its Accept and Reject as they'd be taken. A reader that has no place
   * for them (`reads` false: v1) reads none, every notification's none.
   */
  private async withInviteAnswers<N extends NotifiedInvite>(session: Session, notifications: N[], reads: boolean) {
    const answers = reads ? await this.readInviteAnswers(session, notifications) : undefined;
    return notifications.map((notification) => ({
      ...notification,
      // An invite gone, or no longer its invitee's, can't be answered
      inviteAnswers:
        answers && isOneOf(notification.type, INVITE_NOTIFICATION_TYPES)
          ? (answers[notification.type].get(notification.targetId) ?? NO_INVITE_ANSWERS)
          : null,
    }));
  }

  async getNotifications(
    session: Session,
    where: {
      orderDir?: "asc" | "desc";
      search?: string;
      unreadOnly?: boolean;
    },
    pagination: Pagination,
    readsInviteAnswers = true,
  ) {
    const page = await Notifications.findPage(db, { recipientId: session.userId, ...where }, pagination);
    return { ...page, items: await this.withInviteAnswers(session, page.items, readsInviteAnswers) };
  }

  async getUnreadSummary(session: Session, limit = 10) {
    const [count, items] = await Promise.all([
      Notifications.count(db, { recipientId: session.userId, unread: true }),
      Notifications.findPage(
        db,
        { recipientId: session.userId, unreadOnly: true, orderDir: "desc" },
        { limit, page: 1 },
      ),
    ]);
    return { count, items: await this.withInviteAnswers(session, items.items, true) };
  }

  /**
   * Marks the session's notifications read, but an invite's while its invite may still be answered (`inviteAnswers`'
   * `canReject`), which stays unread until it's answered. The invites are read before the write: one that can't be
   * answered (revoked, answered, gone) never can again.
   */
  async markAllRead(session: Session) {
    const { userId } = session;
    const types = [...INVITE_NOTIFICATION_TYPES];
    const invites = await Notifications.findMany(db, { recipientId: userId, types, unread: true });
    const settledIds = (await this.withInviteAnswers(session, invites, true))
      .filter(({ inviteAnswers }) => !inviteAnswers?.canReject)
      .map(({ id }) => id);
    return await withAccountWrite(userId, async (tx) => {
      const read = await Notifications.markRead(tx, { excludeTypes: types, recipientId: userId });
      return [...read, ...(await Notifications.markRead(tx, { ids: settledIds, recipientId: userId }))];
    });
  }

  async markRead(session: Session, notificationId: string) {
    return await withAccountWrite(session.userId, async (tx) => {
      const result = await Notifications.markRead(tx, {
        id: notificationId,
        recipientId: session.userId,
      });
      if (result.length === 0) throw new NotFoundError("Notification not found");

      return result[0];
    });
  }
}

export default new NotificationsService();
