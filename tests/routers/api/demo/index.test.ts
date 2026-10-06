import { describe, expect, test } from "bun:test";

import { apiAs, expectOk, expectStatus, guestApi, sessionIdFrom } from "@/tests/support/api.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";

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
  });
});
