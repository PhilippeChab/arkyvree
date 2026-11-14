import type { Db } from "@/drizzle/database.ts";
import { ForbiddenError, InternalError } from "@/server/errors/index.ts";
import { CharacterContributors, Contributors, InstanceSettings, Invites, Users } from "@/server/repositories/index.ts";
import { lockInstanceSettings } from "@/server/services/writes/index.ts";

/** What refuses an invite to an address no account holds, on an instance closed to new accounts. */
export const CLOSED_INVITE_MESSAGE = "This person has no account, and this Arkyvree isn't taking new accounts.";

/** What refuses a new account on an instance closed to them. */
export const CLOSED_MESSAGE = "This Arkyvree isn't taking new accounts.";

/** What refuses a new account on an instance that takes invites alone, to an address none was sent to. */
export const INVITE_ONLY_MESSAGE =
  "Signing up here needs an invite: ask someone on this Arkyvree to invite you to a campaign or a ruleset.";

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
 * account's write takes first: an instance without an admin takes it, which becomes its admin (`isAdmin`); otherwise
 * its sign-up setting decides (anyone, an address an invite was sent to, or nobody). Every write that makes an account
 * asks it: a sign-up, a Google account's first sign-in.
 */
export async function checkSignUp(tx: Db, emailAddress: string): Promise<{ isAdmin: boolean }> {
  await lockInstanceSettings(tx);
  if ((await Users.count(tx, { isAdmin: true })) === 0) return { isAdmin: true };

  const settings = await InstanceSettings.findOne(tx);
  if (!settings) throw new InternalError("The instance's settings are missing");
  if (settings.signUpPolicy === "Closed") throw new ForbiddenError(CLOSED_MESSAGE);
  if (settings.signUpPolicy === "Invite Only" && !(await hasPendingInvite(tx, emailAddress)))
    throw new ForbiddenError(INVITE_ONLY_MESSAGE);
  return { isAdmin: false };
}

/**
 * Whether the instance takes no new account at all: closed (`Closed`), with an admin (one without takes its first).
 * An invite to an address no account holds is then refused as it's sent, since nobody could answer it.
 */
export async function isClosedToSignUps(db: Db) {
  const settings = await InstanceSettings.findOne(db);
  return settings?.signUpPolicy === "Closed" && (await Users.count(db, { isAdmin: true })) > 0;
}
