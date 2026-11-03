import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";

/**
 * Whether a policy's check (`check`) lets the session act: refused (forbidden, not now, or answered as an unknown id)
 * is no. What a page is offered is what its policy answers, as `permissions`.
 */
export function isAllowed(check: () => unknown): boolean {
  return readRefusal(check) === null;
}

/**
 * Why a policy's check (`check`) refuses the session, in the words its refusal answers a request with, or `null` when
 * it lets the session act: what a page says where it offers nothing (`isAllowed`'s no).
 */
export function readRefusal(check: () => unknown): string | null {
  try {
    check();
    return null;
  } catch (error) {
    if (
      error instanceof ForbiddenError ||
      error instanceof UnprocessableEntityError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    )
      return error.message;
    throw error;
  }
}
