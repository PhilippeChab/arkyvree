import type { Db } from "@/drizzle/database.ts";
import { ForbiddenError, InternalError } from "@/server/errors/index.ts";
import { hashLinkToken } from "@/server/linkTokens.ts";
import {
  CharacterContributors,
  Contributors,
  InstanceSettings,
  InviteLinks,
  Invites,
  Users,
} from "@/server/repositories/index.ts";
import { lockInstanceSettings } from "@/server/services/writes/index.ts";
import { describeInviteLinkState, INVITE_LINK_MESSAGES } from "@/shared/inviteLinks.ts";

/** What refuses an invite to an address no account holds, on an instance closed to new accounts. */
export const CLOSED_INVITE_MESSAGE = "This person has no account, and this Arkyvree isn't taking new accounts.";

/** What refuses a new account on an instance closed to them. */
export const CLOSED_MESSAGE = "This Arkyvree isn't taking new accounts.";

/** What refuses a new account on an instance that takes invites alone, to an address none was sent to. */
export const INVITE_ONLY_MESSAGE =
  "Signing up here needs an invite: ask someone on this Arkyvree to invite you to a campaign, a ruleset or a character.";

/**
 * Whether an address (`emailAddress`) holds a pending invite no sign-in claimed: to a campaign's seat, a ruleset or a
 * character, the ones its first sign-in gives its account (`openSession`).
 */
async function hasPendingInvite(tx: Db, emailAddress: string) {
  const where = { pendingEmail: emailAddress };
  return (
    (await Invites.exists(tx, where)) ||
    (await Contributors.exists(tx, where)) ||
    (await CharacterContributors.exists(tx, where))
  );
}

/**
 * Checks that an address (`emailAddress`) may make an account on the instance, under its settings' lock, which a new
 * account's write takes first: an instance without an admin who can sign in (`Users.count`) takes it; otherwise its
 * sign-up setting decides (anyone, an address an invite was sent to or someone who opened an invite link, `inviteToken`,
 * or nobody). Every write that makes an account asks it: a sign-up, a Google account's first sign-in. Answers whether
 * the instance has no such admin (`noAdmin`): an account made verified (a Google account's) then becomes its admin; an
 * email's, once it's verified (`markAdminIfNone`). Answers the link it signed up with too (`inviteLinkId`), when its
 * token names one that lets anyone sign up, whatever the setting: what the link's count reads.
 */
export async function checkSignUp(
  tx: Db,
  emailAddress: string,
  inviteToken?: string,
): Promise<{ inviteLinkId?: string; noAdmin: boolean }> {
  await lockInstanceSettings(tx);
  const invite = inviteToken ? await readInviteLink(tx, inviteToken) : undefined;
  const inviteLinkId = invite?.link?.id;
  if ((await Users.count(tx, { isAdmin: true })) === 0) return { inviteLinkId, noAdmin: true };

  const settings = await InstanceSettings.findOne(tx);
  if (!settings) throw new InternalError("The instance's settings are missing");
  if (settings.signUpPolicy === "Closed") throw new ForbiddenError(CLOSED_MESSAGE);
  if (settings.signUpPolicy === "Invite Only" && !inviteLinkId && !(await hasPendingInvite(tx, emailAddress))) {
    if (invite && invite.state !== "Valid") throw new ForbiddenError(INVITE_LINK_MESSAGES[invite.state]);
    throw new ForbiddenError(INVITE_ONLY_MESSAGE);
  }
  return { inviteLinkId, noAdmin: false };
}

/**
 * Whether the instance takes no new account at all: closed (`Closed`), with an admin (one without takes its first).
 * An invite to an address no account holds is then refused as it's sent, since nobody could answer it.
 */
export async function isClosedToSignUps(db: Db) {
  const settings = await InstanceSettings.findOne(db);
  return settings?.signUpPolicy === "Closed" && (await Users.count(db, { isAdmin: true })) > 0;
}

/**
 * Makes an account whose email was just verified (`userId`: an email sign-up's verification, a Google account's link
 * to an unverified one) the instance's admin, when it has none who can sign in, under its settings' lock: an account
 * becomes admin only once it can sign in, so a first sign-up that never verifies blocks nobody. Answers the account it
 * made admin, none when the instance has one.
 */
export async function markAdminIfNone(tx: Db, userId: string) {
  await lockInstanceSettings(tx);
  if ((await Users.count(tx, { isAdmin: true })) > 0) return undefined;
  const [admin] = await Users.update(tx, { isAdmin: true }, { id: userId });
  return admin;
}

/**
 * What an invite link's token (`token`) reads as: the link it names, if any, and whether it lets anyone sign up (one
 * neither revoked nor expired), or why not.
 */
export async function readInviteLink(db: Db, token: string) {
  const link = await InviteLinks.findOne(db, { digest: hashLinkToken(token) });
  const state = describeInviteLinkState(link);
  return { link: state === "Valid" ? link : undefined, state };
}
