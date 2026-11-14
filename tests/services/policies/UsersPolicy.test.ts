import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ForbiddenError } from "@/server/errors/index.ts";
import { UsersPolicy } from "@/server/services/policies/index.ts";
import { thrownBy } from "@/tests/support/errors.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("UsersPolicy", () => {
  test("lets a user's own session change its avatar", async () => {
    const { session } = await createTestUser();

    expect((await UsersPolicy.for(db, session, { id: session.userId })).canEditAvatar()).toBe(true);
  });

  test("refuses anyone else and an unknown user's id alike", async () => {
    const { session } = await createTestUser();
    const { session: other } = await createTestUser();

    for (const [asking, userId] of [
      [other, session.userId],
      [session, NIL_UUID],
    ] as const) {
      const policy = await UsersPolicy.for(db, asking, { id: userId });
      expect(thrownBy(() => policy.canEditAvatar())).toEqual(
        new ForbiddenError("Not authorized to attach to this record"),
      );
    }
  });
});
