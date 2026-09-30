import { type Session } from "@/shared/relations.ts";

/** A session's rights on one entity: each policy has the checks its services make. */
export default abstract class BasePolicy<T> {
  constructor(protected readonly session: Session, protected readonly entity: T) {}
}
