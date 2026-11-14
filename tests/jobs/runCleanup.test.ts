import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { apiKeysInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { runCleanupTask } from "@/server/jobs/runCleanup.ts";
import { ApiKeys } from "@/server/repositories/index.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { silentJobHelpers } from "@/tests/support/jobs.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("runCleanup", () => {
  test("deletes expired API keys, and keeps those that haven't expired or never do", async () => {
    const { session, user } = await createTestUser();
    const expired = await ApiKeysService.createKey(session, "Expired", 30);
    const live = await ApiKeysService.createKey(session, "Live", 30);
    const never = await ApiKeysService.createKey(session, "Never", null);
    await db
      .update(apiKeysInAccount)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(apiKeysInAccount.id, expired.id));

    await runCleanupTask({}, silentJobHelpers);

    const kept = await ApiKeys.findMany(db, { userId: user.id });
    expect(kept.map(({ id }) => id).sort()).toEqual([live.id, never.id].sort());
  });
});
