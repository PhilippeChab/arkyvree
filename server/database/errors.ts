/** Whether a database error is a unique violation: a write that a concurrent one beat to a unique value. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { cause, code } = error as { cause?: { code?: string }; code?: string };
  return code === "23505" || cause?.code === "23505";
}
