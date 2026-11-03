/** An invite as its invitee answers it, whatever it invites to: a ruleset's, a character's or a campaign's. */

import type { Db } from "@/drizzle/database.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { Notifications } from "@/server/repositories/index.ts";
import { createActivityWithNotifications } from "@/server/services/activities/index.ts";
import { readRefusal } from "@/server/services/policies/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The policy of an invite's record (a ruleset's, a character's, a campaign's), as its invitee's answers ask it. */
interface InviteRecordPolicy {
  canAcceptInvite(invite: { status: string }): unknown;
  canAnswerInvite(invite: { status: string }): unknown;
}

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
 * What its invitee may do with an invite: accept it (`canAccept`) or why not, in the refusal's words (`acceptRefusal`),
 * and still answer it, Reject too (`canReject`).
 */
export interface InviteAnswers {
  acceptRefusal: string | null;
  canAccept: boolean;
  canReject: boolean;
}

/** What its invitee may do with an invite gone, or one to a record gone: nothing. */
export const NO_INVITE_ANSWERS: InviteAnswers = { acceptRefusal: null, canAccept: false, canReject: false };

/**
 * What its invitee may do with an invite (`invite`), as its record's policy answers it (`policy`, none for a record
 * gone). Each kind's invite read answers them, which the invite's page renders, and so do its notifications.
 */
export function describeInviteAnswers(
  policy: InviteRecordPolicy | null | undefined,
  invite: { status: string },
): InviteAnswers {
  if (!policy) return NO_INVITE_ANSWERS;

  const acceptRefusal = readRefusal(() => policy.canAcceptInvite(invite));
  return {
    canAccept: acceptRefusal === null,
    acceptRefusal,
    canReject: readRefusal(() => policy.canAnswerInvite(invite)) === null,
  };
}

/**
 * The invite `inviteId` names, addressed to the session's user, whatever its status: whether it's still answered is its
 * record's policy's (`canAnswerInvite`, `canAcceptInvite`). Anyone else's is a 404 (`notFoundMessage`): it doesn't
 * reveal the invite exists.
 */
export async function getOwnInvite<R extends InviteRow>(
  tx: Db,
  session: Session,
  invites: InviteRows<R>,
  inviteId: string,
  notFoundMessage: string,
) {
  const invite = await invites.findOne(tx, { id: inviteId });
  if (!invite || invite.userId !== session.userId) throw new NotFoundError(notFoundMessage);

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
