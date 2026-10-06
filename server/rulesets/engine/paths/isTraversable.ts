/**
 * Whether a target path can step into `value`: an object (an array too) or a function, whose keys `in` can test. A
 * path that reaches a primitive, `null` or `undefined` can't go further.
 */
export function isTraversable(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}
