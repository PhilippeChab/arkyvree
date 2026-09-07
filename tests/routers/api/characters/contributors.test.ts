import type { Application } from "@/server/routers/application.ts";
import { application } from "@/server/routers/application.ts";
import { db } from "@/server/database/index.ts";
import { getSeedContext, type SeedContext } from "@/database/seeds/helpers.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import type { Session } from "@/shared/relations.ts";
import { testClient } from "hono/testing";
import { expect, describe, test } from "bun:test";

describe("characters/contributors router", () => {
  const api = testClient<Application>(application);

  // Owner: TestUser1, invitee: TestUser2 — both seeded with sessions.
  const ownerCookie = "session-id=10000000-0000-4000-8000-000000000789";
  const inviteeCookie = "session-id=10000000-0000-4000-8000-000000000999";
  const ownerUserId = "10000000-0000-4000-8000-000000000789";
  const inviteeEmail = "testuser2@example.com";

  let seedCtx: SeedContext;
  async function getCtx() {
    if (!seedCtx) seedCtx = await getSeedContext(db);
    return seedCtx;
  }

  function ownerSession(): Session {
    return {
      id: "10000000-0000-4000-8000-000000000789",
      userId: ownerUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async function ownerCharacter() {
    const ctx = await getCtx();
    return await CharactersMethods.createCharacter(ownerSession(), {
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: `Router Test ${Math.random().toString(36).substr(2, 6)}`,
      xp: 0,
      alignment: "True Neutral",
      abilities: {},
      age: 25,
      gender: "Other",
      height: "5'10\"",
      weight: "160 lbs",
    });
  }

  test("POST /:id/contributors creates a Pending invite", async () => {
    const character = await ownerCharacter();

    const response = await api.api.characters[":id"].contributors.$post(
      {
        param: { id: character.id },
        json: { email: inviteeEmail },
      },
      { headers: { cookie: ownerCookie } },
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { id: string; status: string; email: string };
    expect(body.status).toBe("Pending");
    expect(body.email).toBe(inviteeEmail);
  });

  test("POST /:id/contributors lowercases mixed-case email and matches existing user", async () => {
    const character = await ownerCharacter();

    const response = await api.api.characters[":id"].contributors.$post(
      {
        param: { id: character.id },
        // Mixed case — Zod sanitizeEmail transform should lowercase it before
        // the service runs Users.findOne.
        json: { email: "TestUser2@Example.COM" },
      },
      { headers: { cookie: ownerCookie } },
    );

    expect(response.status).toBe(201);
    const body = await response.json() as { email: string; userId: string | null };
    expect(body.email).toBe("testuser2@example.com");
    // userId got linked to the seeded TestUser2, proving the lowercased email
    // matched the lowercase users.email_address row.
    expect(body.userId).toBe("10000000-0000-4000-8000-000000000999");
  });

  test("GET /:id/contributors returns the list to the owner", async () => {
    const character = await ownerCharacter();
    await api.api.characters[":id"].contributors.$post(
      { param: { id: character.id }, json: { email: inviteeEmail } },
      { headers: { cookie: ownerCookie } },
    );

    const response = await api.api.characters[":id"].contributors.$get(
      { param: { id: character.id }, query: {} },
      { headers: { cookie: ownerCookie } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { items: Array<{ email: string }> };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].email).toBe(inviteeEmail);
  });

  test("GET /:id/contributors is forbidden to non-contributors", async () => {
    const character = await ownerCharacter();

    const response = await api.api.characters[":id"].contributors.$get(
      { param: { id: character.id }, query: {} },
      { headers: { cookie: inviteeCookie } },
    );
    expect(response.status).toBe(403);
  });

  test("GET /:id/contributors is allowed to active contributors", async () => {
    const character = await ownerCharacter();

    const inviteResp = await api.api.characters[":id"].contributors.$post(
      { param: { id: character.id }, json: { email: inviteeEmail } },
      { headers: { cookie: ownerCookie } },
    );
    const invite = await inviteResp.json() as { id: string };
    await api.api.characters.contributors.invites[":id"].accept.$post(
      { param: { id: invite.id } },
      { headers: { cookie: inviteeCookie } },
    );

    const response = await api.api.characters[":id"].contributors.$get(
      { param: { id: character.id }, query: {} },
      { headers: { cookie: inviteeCookie } },
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { items: unknown[] };
    expect(body.items.length).toBeGreaterThan(0);
  });

  test("invitee can list and accept their pending invite", async () => {
    const character = await ownerCharacter();
    const inviteResp = await api.api.characters[":id"].contributors.$post(
      { param: { id: character.id }, json: { email: inviteeEmail } },
      { headers: { cookie: ownerCookie } },
    );
    expect(inviteResp.status).toBe(201);
    const invite = await inviteResp.json() as { id: string };

    const meResp = await api.api.characters.contributors.invites.me.$get(
      undefined,
      { headers: { cookie: inviteeCookie } },
    );
    expect(meResp.status).toBe(200);
    const invites = await meResp.json() as Array<{ id: string }>;
    expect(invites.find((i) => i.id === invite.id)).toBeDefined();

    const acceptResp = await api.api.characters.contributors.invites[":id"].accept.$post(
      { param: { id: invite.id } },
      { headers: { cookie: inviteeCookie } },
    );
    expect(acceptResp.status).toBe(200);
    const accepted = await acceptResp.json() as { status: string };
    expect(accepted.status).toBe("Active");
  });
});
