/**
 * What `call` throws, for a matcher to read whole: `expect(thrownBy(check)).toEqual(new ConflictError("…"))` is to a
 * sync check what `.rejects.toEqual(…)` is to a promise. Bun's `toThrow` given an error reads its message alone.
 */
export function thrownBy(call: () => unknown) {
  try {
    call();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw, but it answered");
}
