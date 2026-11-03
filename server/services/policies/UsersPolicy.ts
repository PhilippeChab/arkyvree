import type { Db } from "@/drizzle/database.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";

import BasePolicy from "./BasePolicy.ts";

/**
 * A session's rights on a user's own record, its account: what only its own session changes. Its one check is its
 * avatar's (`canEditAvatar`), which the attachments' registry asks.
 */
export default class UsersPolicy extends BasePolicy<{ id: string }> {
  /** The session's policy on `user`: whether it's the user's own session is all its checks read, so it loads nothing. */
  static async for(_db: Db, session: Session, user: { id: string }): Promise<UsersPolicy> {
    return new UsersPolicy(session, user);
  }

  /**
   * Changing the user's avatar (its upload, attach and removal): its own session's, never a demo's, which stores no
   * file; anyone else a 403. The user isn't looked up, so an unknown one's id gets that 403 too.
   */
  canEditAvatar() {
    if (this.session.userId !== this.entity.id || this.session.isDemo)
      throw new ForbiddenError("Not authorized to attach to this record");

    return true;
  }
}
