import { expect, test } from "bun:test";

import { BusyError, ConflictError } from "@/server/errors/index.ts";

import { thrownBy } from "./errors.ts";

/** A check that refuses with `error`. */
function refusingWith(error: Error) {
  return () => {
    throw error;
  };
}

// A refusal's test holds its class and its words only while Bun's `toEqual` reads them. CI runs the latest Bun, so an
// upgrade that reads less fails here, not silently in every one of them.
test("toEqual takes the same error, and neither a subclass with its words nor its class with other words", () => {
  const refusal = new ConflictError("No");
  expect(new ConflictError("No")).toEqual(refusal);
  expect(thrownBy(refusingWith(new ConflictError("No")))).toEqual(refusal);
  expect(Promise.reject(new ConflictError("No"))).rejects.toEqual(refusal);

  // A `BusyError` is a `ConflictError` of the same status and cause: its `name` alone tells them apart
  for (const other of [new BusyError("No"), new ConflictError("Never")]) {
    expect(other).not.toEqual(refusal);
    expect(thrownBy(refusingWith(other))).not.toEqual(refusal);
    expect(Promise.reject(other)).rejects.not.toEqual(refusal);
  }

  // A check that answers fails, rather than compare nothing
  expect(() => thrownBy(() => true)).toThrow("Expected the call to throw");
});
