import { describe, expect, test } from "bun:test";

import { expectOk, expectStatus, guestApi, sessionIdFrom } from "@/tests/support/api.ts";
import { apiAs } from "@/tests/support/clients.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createSignedInUser } from "@/tests/support/users.ts";

function anHourAgo() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

/** Starts a demo and returns a client signed in as the demo user. */
async function startDemo() {
  const response = await guestApi.api.demo.start.$post();
  expect(response.status).toBe(201);
  return { user: await expectOk(response), api: apiAs(sessionIdFrom(response)) };
}

describe("demo", () => {
  test("mints an expiring demo user and signs them in", async () => {
    const { user } = await startDemo();
    expect(user.emailAddress).toMatch(/^demo-[0-9a-f-]+@demo\.invalid$/);
    expect(user.expiresAt).not.toBeNull();
  });

  test("starts a demo for a browser whose cookie holds no session's id", async () => {
    const response = await apiAs("not-a-session-id").api.demo.start.$post();
    expect(response.status).toBe(201);
  });

  test("starts a demo for a browser whose cookie holds a session that isn't stored", async () => {
    const response = await apiAs(NIL_UUID).api.demo.start.$post();
    expect(response.status).toBe(201);
  });

  test("starts a new demo for a browser whose demo session or demo user has expired", async () => {
    for (const expired of [{ sessionExpiresAt: anHourAgo() }, { expiresAt: anHourAgo() }]) {
      const { session, user } = await createSignedInUser({ prefix: "demo", ...expired });
      const response = await apiAs(session.id).api.demo.start.$post();
      expect(response.status).toBe(201);
      expect((await expectOk(response)).id).not.toBe(user.id);
      expect(sessionIdFrom(response)).not.toBe(session.id);
    }
  });

  test("refuses a signed-in user's browser, whose cookie it would replace", async () => {
    const { session } = await createSignedInUser();
    await expectStatus(apiAs(session.id).api.demo.start.$post(), 400);
  });

  test("starts a demo for a signed-in user whose session has expired", async () => {
    const { session } = await createSignedInUser({ sessionExpiresAt: anHourAgo() });
    expect((await apiAs(session.id).api.demo.start.$post()).status).toBe(201);
  });

  test("keeps the demo user of a browser that already has one", async () => {
    const { user, api } = await startDemo();
    const again = await api.api.demo.start.$post();
    expect(again.status).toBe(200);
    expect((await expectOk(again)).id).toBe(user.id);
  });

  test("refuses what a demo user must not do", async () => {
    const { api } = await startDemo();
    // An email change would send a verification email to any address.
    await expectStatus(api.auth.profile.$put({ json: { emailAddress: "attacker@example.com" } }), 403);
    // Deleting the account would orphan its rulesets.
    await expectStatus(api.auth["delete-account"].$post({ json: { password: "doesnt-matter" } }), 403);
    // A campaign would leave a players row behind when the demo expires.
    await expectStatus(api.api.campaigns.$post({ json: { name: "demo campaign", rulesetId: NIL_UUID } }), 403);
    // A demo account has no access to the public API: it makes, lists and revokes no key
    await expectStatus(api.auth["api-keys"].$post({ json: { expiresInDays: null, name: "demo key" } }), 403);
    await expectStatus(api.auth["api-keys"].$get(), 403);
    await expectStatus(api.auth["api-keys"][":id"].$delete({ param: { id: NIL_UUID } }), 403);
  });
});
