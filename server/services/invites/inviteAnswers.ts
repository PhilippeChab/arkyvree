/** An invite as its invitee answers it, whatever it invites to: a ruleset's, a character's or a campaign's. */

import type { Db } from "@/drizzle/database.ts";
import { ConflictError, NotFoundError } from "@/server/errors/index.ts";
import { Notifications } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import type { Session } from "@/shared/relations.ts";

/** An invite's row, as its invitee answers it. */
interface InviteRow {
  id: string;
  status: string;
  userId: string | null;
}

/** The repository an invite is in: `Contributors`, `CharacterContributors`, `Invites`. */
interface InviteRows<R extends InviteRow> {
  findOne(db: Db, where: { id: string }): Promise<R | undefined>;
  update(db: Db, values: { status: string }, where: { id: string }): Promise<R[]>;
}

/**
 * The pending invite `inviteId` names, addressed to the session's user. Anyone else's is a 404 (`notFoundMessage`): it
 * doesn't reveal the invite exists.
 */
export async function getPendingInvite<R extends InviteRow>(
  tx: Db,
  session: Session,
  invites: InviteRows<R>,
  inviteId: string,
  notFoundMessage: string,
) {
  const invite = await invites.findOne(tx, { id: inviteId });
  if (!invite || invite.userId !== session.userId) throw new NotFoundError(notFoundMessage);

  if (invite.status !== "Pending") throw new ConflictError("Invite is no longer pending");

  return invite;
}

/**
 * The invitee's answer: the invite's `status`, its notification read, and the activity its sender's side is told of
 * (`activity`: its target's type, its type and its data).
 */
export async function saveInviteAnswer<R extends InviteRow>(
  tx: Db,
  session: Session,
  invites: InviteRows<R>,
  inviteId: string,
  status: string,
  activity: { data: Record<string, unknown>; targetType: string; type: string },
) {
  const [updated] = await invites.update(tx, { status }, { id: inviteId });
  await Notifications.markRead(tx, { recipientId: session.userId, targetId: inviteId });
  await createActivityWithNotifications(tx, { userId: session.userId, targetId: updated.id, ...activity });
  return updated;
}
