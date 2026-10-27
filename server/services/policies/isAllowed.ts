import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";

/**
 * Whether a policy's check (`check`) lets the session act: refused (forbidden, not now, or answered as an unknown id)
 * is no. What a page is offered is what its policy answers, as `permissions`.
 */
export function isAllowed(check: () => unknown): boolean {
  try {
    check();
    return true;
  } catch (error) {
    if (
      error instanceof ForbiddenError ||
      error instanceof UnprocessableEntityError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    )
      return false;
    throw error;
  }
}
