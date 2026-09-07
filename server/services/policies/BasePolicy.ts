import { type Session } from "@/shared/relations.ts";

export default abstract class BasePolicy<T> {
  constructor(protected readonly session: Session, protected readonly entity: T) {}

  abstract canCreate(...args: unknown[]): boolean | Promise<boolean>;
  abstract canRead(...args: unknown[]): boolean | Promise<boolean>;
  abstract canUpdate(...args: unknown[]): boolean | Promise<boolean>;
  abstract canDelete(...args: unknown[]): boolean | Promise<boolean>;
}
