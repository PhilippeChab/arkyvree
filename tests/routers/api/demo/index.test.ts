import { describe, expect, test } from "bun:test";

import { expectOk, expectStatus, guestApi, sessionIdFrom } from "@/tests/support/api.ts";
import { apiAs } from "@/tests/support/clients.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createUserWithSession } from "@/tests/support/users.ts";

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
      const { session, user } = await createUserWithSession({ prefix: "demo", ...expired });
      const response = await apiAs(session.id).api.demo.start.$post();
      expect(response.status).toBe(201);
      expect((await expectOk(response)).id).not.toBe(user.id);
      expect(sessionIdFrom(response)).not.toBe(session.id);
    }
  });

  test("refuses a signed-in user's browser, whose cookie it would replace", async () => {
    const { session } = await createUserWithSession();
    await expectStatus(apiAs(session.id).api.demo.start.$post(), 400);
  });

  test("starts a demo for a signed-in user whose session has expired", async () => {
    const { session } = await createUserWithSession({ sessionExpiresAt: anHourAgo() });
    expect((await apiAs(session.id).api.demo.start.$post()).status).toBe(201);
  });

  test("keeps the demo user of a browser that already has one", async () => {
    const { user, api } = await startDemo();
    const again = await api.api.demo.start.$post();
    expect(again.status).toBe(200);
    expect((await expectOk(again)).id).toBe(user.id);
  });

  test("refuses a demo user its account's own features", async () => {
    const { user, api } = await startDemo();
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
    // Nor does it store a file: its avatar is the account's
    const avatar = { recordType: "User", recordId: user.id, name: "avatar" };
    await expectStatus(
      api.api.attachments["direct-uploads"].$post({
        json: { ...avatar, filename: "me.png", contentType: "image/png", byteSize: 1024 },
      }),
      403,
    );
  });

  test("refuses a demo user, by its records' policies, what pulls others in or reaches outside its account", async () => {
    const { user, api } = await startDemo();
    const character = await createTestCharacter(user.id);
    const param = { id: character.id };

    // Its page answers what it may do: its contributors it reads, as any editor does, and nothing that needs an account
    expect((await expectOk(api.api.characters[":id"].$get({ param }))).permissions).toMatchObject({
      canEditPortrait: false,
      canExport: false,
      canManageContributors: false,
      canReadContributors: true,
      canShare: false,
    });
    await expectOk(api.api.characters[":id"].contributors.$get({ param, query: {} }));

    const invite = api.api.characters[":id"].contributors.$post({ param, json: { email: "friend@example.com" } });
    await expectStatus(invite, 403);
    await expectStatus(api.api.characters[":id"].share.$post({ param }), 403);
    // Its PDF, as any export it may not make: the 404 an unknown character gets
    await expectStatus(api.api.characters[":characterId"].pdf.$post({ param: { characterId: character.id } }), 404);
    const portrait = { recordType: "Character", recordId: character.id, name: "portrait" };
    await expectStatus(
      api.api.attachments["direct-uploads"].$post({
        json: { ...portrait, filename: "me.png", contentType: "image/png", byteSize: 1024 },
      }),
      403,
    );

    const ruleset = await createTestRuleset(user.id);
    await expectStatus(api.api.rulesets[":id"].publish.$post({ param: { id: ruleset.id }, json: {} }), 403);
    const rulesetInvite = { email: "friend@example.com", role: "Editor" as const };
    await expectStatus(
      api.api.rulesets[":id"].contributors.$post({ param: { id: ruleset.id }, json: rulesetInvite }),
      403,
    );
  });
});
