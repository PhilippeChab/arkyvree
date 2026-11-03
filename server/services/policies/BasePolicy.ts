import { ConflictError, ForbiddenError, SIGN_UP_MESSAGE } from "@/server/errors/index.ts";
import type { Session } from "@/shared/relations.ts";

/**
 * A session's rights on one entity: each policy has the checks its services make. A service builds one with its
 * `for(db, session, entity)`, which loads the session's standing on the entity (its role on it). A check reads that
 * standing, and what the service passes it about other rows (`{ inUse }`), and throws or answers at once.
 */
export default abstract class BasePolicy<T> {
  constructor(
    protected readonly session: Session,
    protected readonly entity: T,
  ) {}

  /**
   * What a demo's session (`isDemo`) may not do on any record, whatever its standing on it: pull other users in (its
   * contributors, its players), reach outside its account (a share link, publishing, a PDF), or store a file.
   */
  protected canUseSignedUpFeatures() {
    if (this.session.isDemo) throw new ForbiddenError(SIGN_UP_MESSAGE);

    return true;
  }

  /**
   * Answering an invite to the record, accepting or rejecting it (`status`, the invite's): a pending one, as neither an
   * answered nor a revoked one is. Each kind's `canAcceptInvite` asks it first.
   */
  canAnswerInvite({ status }: { status: string }) {
    if (status !== "Pending") throw new ConflictError("Invite is no longer pending");

    return true;
  }
}
