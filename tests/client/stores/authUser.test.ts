import { describe, expect, test } from "bun:test";

import { readAuthUser } from "@/client/src/stores/authUser.ts";

describe("A user as storage held it", () => {
  test("is read back field by field, an unknown field left out and a missing one none", () => {
    expect(readAuthUser({ id: "u1", emailAddress: "a@b.c", username: "Ann", passwordDigest: "x" })).toEqual({
      id: "u1",
      emailAddress: "a@b.c",
      username: "Ann",
      pendingEmailAddress: null,
      onboardingCompletedAt: null,
      expiresAt: null,
    });
  });

  test("is none when it isn't one: no id, no email address, or not an object", () => {
    expect(readAuthUser({ emailAddress: "a@b.c" })).toBeNull();
    expect(readAuthUser({ id: "u1", emailAddress: 3 })).toBeNull();
    expect(readAuthUser("u1")).toBeNull();
    expect(readAuthUser(null)).toBeNull();
  });
});
