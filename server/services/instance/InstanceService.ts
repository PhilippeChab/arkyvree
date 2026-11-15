import { db } from "@/server/database/index.ts";
import { InternalError, NotFoundError } from "@/server/errors/index.ts";
import { generateInviteLinkToken } from "@/server/inviteLinkTokens.ts";
import {
  EmailVerifications,
  InstanceSettings,
  InviteLinks,
  type Pagination,
  Users,
} from "@/server/repositories/index.ts";
import { signOutEverywhere } from "@/server/services/authentication/index.ts";
import { InstancePolicy } from "@/server/services/policies/index.ts";
import { withAdministeredAccount, withInstanceWrite } from "@/server/services/writes/index.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";
import { describeInviteLinkState } from "@/shared/inviteLinks.ts";
import type { Session, User } from "@/shared/relations.ts";

/** A day, in milliseconds: what an invite link's lifetime counts in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** An account as the instance's admins list it: who it is, and what they've set of it. Never its password's digest. */
function toListedAccount(user: User) {
  return {
    createdAt: user.createdAt,
    deactivatedAt: user.deactivatedAt,
    emailAddress: user.emailAddress,
    emailVerifiedAt: user.emailVerifiedAt,
    id: user.id,
    isAdmin: user.isAdmin,
    username: user.username,
  };
}

/** An invite link as its admins see it, its state with it (one that lets anyone sign up, expired or revoked). */
function toListedInviteLink<T extends { expiresAt: string; revokedAt: string | null }>(link: T) {
  return { ...link, state: describeInviteLinkState(link) };
}

/**
 * The instance, as its admins run it: who may make an account (its sign-up setting), and its accounts, which an admin
 * makes admins, deactivates and reactivates, or whose email they mark verified (an instance that sends no email).
 */
class InstanceService {
  /**
   * Makes an invite link that lets anyone who opens it sign up for `expiresInDays` days, while the instance takes
   * invites: its token is answered this once, the database keeping its digest alone.
   */
  async createInviteLink(session: Session, expiresInDays: number) {
    return await withInstanceWrite(session, async (tx) => {
      const settings = await InstanceSettings.findOne(tx);
      if (!settings) throw new InternalError("The instance's settings are missing");
      (await InstancePolicy.for(tx, session)).canCreateInviteLink(settings.signUpPolicy);

      const { digest, token } = generateInviteLinkToken();
      const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS).toISOString();
      const [link] = await InviteLinks.create(tx, { createdBy: session.userId, digest, expiresAt });
      if (!link) throw new InternalError("Could not create the invite link");
      return { ...toListedInviteLink(link), token };
    });
  }

  /** The instance's accounts, a page at a time (the newest first), those whose address or username holds `search`. */
  async getAccounts(session: Session, where: { search?: string }, pagination: Pagination) {
    (await InstancePolicy.for(db, session)).canAdminister();
    return await Users.findPage(db, where, pagination);
  }

  /**
   * The instance's invite links, a page at a time, the newest first: who made each, when it expires, whether it was
   * revoked, and how many accounts signed up with it. Never their tokens, which the database doesn't keep.
   */
  async getInviteLinks(session: Session, pagination: Pagination) {
    (await InstancePolicy.for(db, session)).canAdminister();
    const page = await InviteLinks.findPage(db, pagination);
    return { ...page, items: page.items.map(toListedInviteLink) };
  }

  /** Who may make an account on the instance. */
  async getSettings(session: Session) {
    (await InstancePolicy.for(db, session)).canAdminister();
    const settings = await InstanceSettings.findOne(db);
    if (!settings) throw new InternalError("The instance's settings are missing");
    return { signUpPolicy: settings.signUpPolicy };
  }

  /** Marks an account's email verified, for an instance whose code never reaches it: nothing when it already is. */
  async markAccountVerified(session: Session, userId: string) {
    return await withAdministeredAccount(session, userId, async (tx, account) => {
      (await InstancePolicy.for(tx, session, account)).canAdminister();
      if (account.emailVerifiedAt) return toListedAccount(account);

      const [updated] = await Users.update(tx, { emailVerifiedAt: new Date().toISOString() }, { id: account.id });
      await EmailVerifications.archive(tx, { userId: account.id });
      return toListedAccount(updated);
    });
  }

  /** Revokes an invite link: it lets nobody sign up from then on. Nothing when it already was. */
  async revokeInviteLink(session: Session, linkId: string) {
    return await withInstanceWrite(session, async (tx) => {
      (await InstancePolicy.for(tx, session)).canAdminister();
      const link = await InviteLinks.findOne(tx, { id: linkId });
      if (!link) throw new NotFoundError("Invite link not found");
      if (link.revokedAt) return toListedInviteLink(link);

      const [revoked] = await InviteLinks.update(tx, { revokedAt: new Date().toISOString() }, { id: linkId });
      return toListedInviteLink(revoked ?? link);
    });
  }

  /** Makes an account one of the instance's admins, or no longer one (`isAdmin`): it keeps one at least. */
  async setAccountAdmin(session: Session, userId: string, isAdmin: boolean) {
    return await withAdministeredAccount(session, userId, async (tx, account) => {
      const activeAdmins = await Users.count(tx, { isAdmin: true });
      (await InstancePolicy.for(tx, session, account)).canSetAdmin(isAdmin, { activeAdmins });
      if (account.isAdmin === isAdmin) return toListedAccount(account);

      const [updated] = await Users.update(tx, { isAdmin }, { id: account.id });
      return toListedAccount(updated);
    });
  }

  /**
   * Deactivates an account (`deactivated`), or reactivates it: a deactivated one is signed out everywhere (its
   * sessions, its API keys, its connected apps) and signs in nowhere, its data kept as it is.
   */
  async setAccountDeactivated(session: Session, userId: string, deactivated: boolean) {
    return await withAdministeredAccount(session, userId, async (tx, account) => {
      const policy = await InstancePolicy.for(tx, session, account);
      if (deactivated) policy.canDeactivate();
      else policy.canAdminister();
      if (!!account.deactivatedAt === deactivated) return toListedAccount(account);

      const [updated] = await Users.update(
        tx,
        { deactivatedAt: deactivated ? new Date().toISOString() : null },
        { id: account.id },
      );
      if (deactivated) await signOutEverywhere(tx, account.id);
      return toListedAccount(updated);
    });
  }

  /** Sets who may make an account on the instance: anyone, an address an invite was sent to, or nobody. */
  async updateSettings(session: Session, signUpPolicy: SignUpPolicy) {
    return await withInstanceWrite(session, async (tx) => {
      (await InstancePolicy.for(tx, session)).canAdminister();
      const settings = await InstanceSettings.update(tx, { signUpPolicy });
      if (!settings) throw new InternalError("The instance's settings are missing");
      return { signUpPolicy: settings.signUpPolicy };
    });
  }
}

export default new InstanceService();
