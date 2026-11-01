import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { apiKeysInAccount } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ApiKeys, Users } from "@/server/repositories/index.ts";
import { application } from "@/server/routers/application.ts";
import { ApiKeysService } from "@/server/services/authentication/apiKeys/index.ts";
import { createKeyedApi, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { apiAs, apiWithKey } from "@/tests/support/clients.ts";
import { createSignedInUser, createTestUser } from "@/tests/support/users.ts";

describe("v1", () => {
  test("answers a request sent with a key as its user, and marks the key used", async () => {
    const { user } = await createTestUser();
    const { api, key } = await createKeyedApi(user.id);

    expect(await expectOk(api.v1.characters.$get({ query: {} }))).toEqual({ items: [], nextPage: null, page: 1 });
    const [used] = await ApiKeys.findMany(db, { userId: user.id });
    expect(used?.lastUsedAt).not.toBeNull();
    expect(used?.id).toBe(key.id);
  });

  test("refuses a request without a key, with a key no user has, or with a session's cookie alone", async () => {
    const { session } = await createTestUser();
    await expectStatus(guestApi.v1.characters.$get({ query: {} }), 401);
    await expectStatus(apiWithKey("ark_not-a-key").v1.characters.$get({ query: {} }), 401);
    await expectStatus(apiAs(session.id).v1.characters.$get({ query: {} }), 401);
  });

  test("answers a path no route answers with the API's error, never the app's page", async () => {
    const { key } = await createKeyedApi();
    const headers = { authorization: `Bearer ${key.token}` };
    const response = await expectStatus(application.request("/v1/campaigns", { headers }), 404);
    expect(await response.json()).toMatchObject({ cause: "notFound" });
  });

  test("refuses a demo user's key: a demo account has no access to the public API", async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { user } = await createSignedInUser({ expiresAt, prefix: "demo" });
    // A demo makes no key through the app (`denyDemoUser`): one written straight to the database signs in nothing
    const { api } = await createKeyedApi(user.id);
    await expectStatus(api.v1.characters.$get({ query: {} }), 401);
  });

  test("refuses an expired key", async () => {
    const { user } = await createTestUser();
    const { api, key } = await createKeyedApi(user.id);
    await expectOk(api.v1.characters.$get({ query: {} }));
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    await db.update(apiKeysInAccount).set({ expiresAt }).where(eq(apiKeysInAccount.id, key.id));
    await expectStatus(api.v1.characters.$get({ query: {} }), 401);
  });

  test("refuses a revoked key, and a key whose user deleted their account", async () => {
    const { user, session } = await createTestUser();
    const revoked = await createKeyedApi(user.id);
    await ApiKeysService.revokeKey(session, revoked.key.id);
    await expectStatus(revoked.api.v1.characters.$get({ query: {} }), 401);

    const kept = await createKeyedApi(user.id);
    await Users.archive(db, { id: user.id });
    await expectStatus(kept.api.v1.characters.$get({ query: {} }), 401);
  });
});
