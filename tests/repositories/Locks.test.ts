import { expect, test } from "bun:test";

import { apiKeysInAccount } from "@/drizzle/schema.ts";
import { withTransaction } from "@/server/database/index.ts";
import { Locks } from "@/server/repositories/index.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

test("a write takes its locks users first, then rulesets, campaigns, characters, and other rows", async () => {
  const { user } = await createTestUser("locker");
  const { rulesetId } = await getSeedCtx();
  // A row of none of those kinds: one of the user's API keys
  const key = await ApiKeysService.createKey({ userId: user.id }, "Locked key", null);

  // In the order: each kind's lock after the ones before it, and two of one kind in turn
  await withTransaction(async (tx) => {
    expect((await Locks.lockUser(tx, user.id, "share"))?.id).toBe(user.id);
    expect((await Locks.lockRulesets(tx, { ids: [rulesetId] }, "share")).has(rulesetId)).toBe(true);
    expect(await Locks.lockRulesets(tx, { ids: [] }, "share")).toEqual(new Map());
    expect(await Locks.lockCampaigns(tx, { userIds: [user.id] }, "share")).toEqual([]);
    expect(await Locks.lockCharacters(tx, { userIds: [user.id] }, "share")).toEqual([]);
    expect(await Locks.lockRow(tx, apiKeysInAccount, key.id, "share")).toBe(true);
  });

  // A lock that comes after one ranked above it would wait on others in the reverse order: refused, a program's error
  const late = withTransaction(async (tx) => {
    await Locks.lockCharacters(tx, { ids: [] }, "share");
    await Locks.lockUser(tx, user.id, "share");
  });
  expect(late).rejects.toEqual(
    new Error("Locks go users, rulesets, campaigns, characters, then other rows: a user's came too late"),
  );
});
