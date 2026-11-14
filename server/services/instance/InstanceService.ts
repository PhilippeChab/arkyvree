import { db } from "@/server/database/index.ts";
import { InternalError } from "@/server/errors/index.ts";
import { EmailVerifications, InstanceSettings, type Pagination, Users } from "@/server/repositories/index.ts";
import { signOutEverywhere } from "@/server/services/authentication/index.ts";
import { InstancePolicy } from "@/server/services/policies/index.ts";
import { withAdministeredAccount, withInstanceWrite } from "@/server/services/writes/index.ts";
import type { SignUpPolicy } from "@/shared/enums.ts";
import type { Session, User } from "@/shared/relations.ts";

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

/**
 * The instance, as its admins run it: who may make an account (its sign-up setting), and its accounts, which an admin
 * makes admins, deactivates and reactivates, or whose email they mark verified (an instance that sends no email).
 */
class InstanceService {
  /** The instance's accounts, a page at a time (the newest first), those whose address or username holds `search`. */
  async getAccounts(session: Session, where: { search?: string }, pagination: Pagination) {
    (await InstancePolicy.for(db, session)).canAdminister();
    return await Users.findPage(db, where, pagination);
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
