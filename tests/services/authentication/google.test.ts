import { expect, test } from "bun:test";

import { isVerifiedByGoogle } from "@/server/services/authentication/google.ts";

test("reads a token's email_verified as Google answers it, a text or a flag", () => {
  expect([true, "true"].map(isVerifiedByGoogle)).toEqual([true, true]);
  expect([false, "false", ""].map(isVerifiedByGoogle)).toEqual([false, false, false]);
});
