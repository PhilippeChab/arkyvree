import { ConflictError } from "@/server/errors/index.ts";
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
   * Answering an invite to the record, accepting or rejecting it (`status`, the invite's): a pending one, as neither an
   * answered nor a revoked one is. Each kind's `canAcceptInvite` asks it first.
   */
  canAnswerInvite({ status }: { status: string }) {
    if (status !== "Pending") throw new ConflictError("Invite is no longer pending");

    return true;
  }
}
