import type { Db } from "@/drizzle/database.ts";
import { ConflictError, ForbiddenError } from "@/server/errors/index.ts";
import { Users } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/**
 * An account of the instance as an admin's check reads it: whether it's an admin, whether it's deactivated, and whether
 * its email is verified (an admin who can't sign in counts for none).
 */
interface InstanceAccount {
  deactivatedAt: string | null;
  emailVerifiedAt: string | null;
  id: string;
  isAdmin: boolean;
}

/**
 * A session's rights on the instance: its settings (who may make an account) and its accounts (`entity`, the one a
 * check is about), which its admins alone change. An admin is an account marked so that's neither deleted nor
 * deactivated, its email verified (one that can sign in); the instance keeps one at least.
 */
export default class InstancePolicy extends BasePolicy<InstanceAccount | undefined> {
  constructor(
    session: Session,
    entity: InstanceAccount | undefined,
    private readonly isAdmin: boolean,
  ) {
    super(session, entity);
  }

  /** The session's policy on the instance, on one of its accounts (`account`) when a check is about one. */
  static async for(db: Db, session: Session, account?: InstanceAccount): Promise<InstancePolicy> {
    const user = await Users.findOne(db, { id: session.userId });
    return new InstancePolicy(session, account, !!user?.isAdmin && !user.deactivatedAt && !!user.emailVerifiedAt);
  }

  /**
   * Whether the account is the instance's last admin who can act (`activeAdmins`, how many it has): an admin, neither
   * deactivated nor unverified, and the only one.
   */
  private isLastAdmin(activeAdmins: number) {
    const entity = this.entity;
    return !!entity?.isAdmin && !entity.deactivatedAt && !!entity.emailVerifiedAt && activeAdmins <= 1;
  }

  /** Reading or changing the instance's settings and its accounts: its admins'; anyone else a 403. */
  canAdminister() {
    if (!this.isAdmin) throw new ForbiddenError("Only an admin of this Arkyvree can do this");

    return true;
  }

  /**
   * Deactivating the account: an admin's, never of their own account (they'd lock themselves out, and the instance
   * could lose its last admin).
   */
  canDeactivate() {
    this.canAdminister();
    if (this.entity?.id === this.session.userId) throw new ConflictError("You can't deactivate your own account");

    return true;
  }

  /**
   * Deleting the account, its own session's: never the instance's last admin's (`activeAdmins`, how many it has), or
   * the instance would take any next account as its admin, whatever its sign-up setting.
   */
  canDeleteAccount({ activeAdmins }: { activeAdmins: number }) {
    if (this.isLastAdmin(activeAdmins))
      throw new ConflictError(
        "You're this Arkyvree's only admin: make someone else admin before deleting your account.",
      );

    return true;
  }

  /**
   * Making the account an admin, or no longer one (`isAdmin`): an admin's, but the instance's last admin stays one
   * (`activeAdmins`, how many it has), or nobody could change its settings.
   */
  canSetAdmin(isAdmin: boolean, { activeAdmins }: { activeAdmins: number }) {
    this.canAdminister();
    if (!isAdmin && this.isLastAdmin(activeAdmins))
      throw new ConflictError("This Arkyvree needs an admin: make another account an admin first");

    return true;
  }
}
