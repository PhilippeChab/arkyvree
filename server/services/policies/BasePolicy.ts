import { type Session } from "@/shared/relations.ts";

/**
 * A session's rights on one entity: each policy has the checks its services make. A service builds one with its
 * `for(db, session, entity)`, which loads the session's standing on the entity (its role on it). A check reads that
 * standing, and what the service passes it about other rows (`{ inUse }`), and throws or answers at once.
 */
export default abstract class BasePolicy<T> {
  constructor(
    protected readonly session: Pick<Session, "userId">,
    protected readonly entity: T,
  ) {}
}
