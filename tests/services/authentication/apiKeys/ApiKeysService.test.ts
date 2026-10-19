import { describe, expect, test } from "bun:test";

import { apiKeysInAccount } from "@/drizzle/schema.ts";
import { hashApiKeyToken } from "@/server/apiKeyTokens.ts";
import { db } from "@/server/database/index.ts";
import { ApiKeys } from "@/server/repositories/index.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { MAX_API_KEYS } from "@/shared/apiKeys.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { insertRows } from "@/tests/support/database.ts";
import { uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

describe("ApiKeysService", () => {
  test("makes a key whose token is shown once: the database keeps its digest and its start", async () => {
    const { session } = await createTestUser();
    const key = await ApiKeysService.createKey(session, "Leveling agent");

    expect(key.token).toMatch(/^ark_[A-Za-z0-9_-]{43}$/);
    expect(key).toMatchObject({ name: "Leveling agent", prefix: key.token.slice(0, 12), lastUsedAt: null });
    expect(key).not.toHaveProperty("digest");
    expect(await ApiKeys.findOne(db, { digest: hashApiKeyToken(key.token) })).toMatchObject({ id: key.id });

    const [listed] = await ApiKeysService.getKeys(session);
    expect(listed).toMatchObject({ id: key.id, name: "Leveling agent", prefix: key.prefix });
    expect(listed).not.toHaveProperty("digest");
    expect(listed).not.toHaveProperty("token");
  });

  test("lists a user's own keys, the newest first", async () => {
    const { session } = await createTestUser();
    const { session: other } = await createTestUser();
    // A test's rows are made in one transaction, at one time: each key is made at its own
    const [older, newer] = await insertRows(apiKeysInAccount, [
      {
        createdAt: "2026-01-01T00:00:00Z",
        digest: uniqueId(),
        name: "Older",
        prefix: "ark_older",
        userId: session.userId,
      },
      {
        createdAt: "2026-02-01T00:00:00Z",
        digest: uniqueId(),
        name: "Newer",
        prefix: "ark_newer",
        userId: session.userId,
      },
    ]);
    await ApiKeysService.createKey(other, "Someone else's");

    expect((await ApiKeysService.getKeys(session)).map(({ id }) => id)).toEqual([newer.id, older.id]);
  });

  test("refuses a key past the most a user keeps, until one is revoked", async () => {
    const { session } = await createTestUser();
    const keys = [];
    for (let i = 0; i < MAX_API_KEYS; i++) keys.push(await ApiKeysService.createKey(session, `Key ${i}`));

    await expectRefusedWith(ApiKeysService.createKey(session, "One too many"), 422);
    await ApiKeysService.revokeKey(session, keys[0]!.id);
    expect(await ApiKeysService.createKey(session, "In its place")).toMatchObject({ name: "In its place" });
  });

  test("revokes a key: it's deleted, and its token names no key from then on", async () => {
    const { session } = await createTestUser();
    const key = await ApiKeysService.createKey(session, "Revoked");

    expect(await ApiKeysService.revokeKey(session, key.id)).toMatchObject({ id: key.id });
    expect(await ApiKeysService.getKeys(session)).toEqual([]);
    expect(await ApiKeys.findOne(db, { digest: hashApiKeyToken(key.token) })).toBeUndefined();
  });

  test("refuses to revoke another user's key, which keeps working", async () => {
    const { session } = await createTestUser();
    const { session: other } = await createTestUser();
    const key = await ApiKeysService.createKey(other, "Theirs");

    await expectRefusedWith(ApiKeysService.revokeKey(session, key.id), 404);
    expect(await ApiKeysService.getKeys(other)).toHaveLength(1);
  });
});
